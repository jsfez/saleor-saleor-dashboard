import { WebhookEventTypeAsyncEnum, WebhookEventTypeSyncEnum } from "@dashboard/graphql";

import {
  createWebhookSyncPlan,
  executeWebhookSyncPlan,
  hasWebhookSyncChanges,
  type ManifestWebhook,
  parseWebhookRefreshManifest,
  type RegisteredWebhook,
} from "./webhookManifestSync";

const manifestWebhook: ManifestWebhook = {
  name: "Order created",
  targetUrl: "https://example.com/webhooks/order-created",
  query: "subscription { event { __typename } }",
  isActive: true,
  asyncEvents: [WebhookEventTypeAsyncEnum.ORDER_CREATED],
  syncEvents: [],
};

const registeredWebhook: RegisteredWebhook = {
  id: "webhook-1",
  name: "Order created",
  targetUrl: "https://example.com/webhooks/order-created",
  subscriptionQuery: "subscription {\n  event {\n    __typename\n  }\n}",
  isActive: true,
  asyncEvents: [{ eventType: WebhookEventTypeAsyncEnum.ORDER_CREATED }],
  syncEvents: [],
};

describe("parseWebhookRefreshManifest", () => {
  it("parses webhook defaults and accepts granted permissions", () => {
    // Arrange
    const input = {
      id: "example.app",
      permissions: ["MANAGE_ORDERS"],
      webhooks: [
        {
          name: "Order created",
          targetUrl: "https://example.com/webhooks/order-created",
          query: "subscription { event { __typename } }",
          asyncEvents: [WebhookEventTypeAsyncEnum.ORDER_CREATED],
        },
      ],
    };

    // Act
    const result = parseWebhookRefreshManifest({
      input,
      appIdentifier: "example.app",
      grantedPermissions: ["MANAGE_ORDERS"],
    });

    // Assert
    expect(result.webhooks[0]).toEqual({
      ...input.webhooks[0],
      isActive: true,
      syncEvents: [],
    });
  });

  it("rejects a manifest for a different app", () => {
    // Arrange
    const input = { id: "another.app", webhooks: [] };

    // Act
    const act = (): ReturnType<typeof parseWebhookRefreshManifest> =>
      parseWebhookRefreshManifest({
        input,
        appIdentifier: "example.app",
        grantedPermissions: [],
      });

    // Assert
    expect(act).toThrow(expect.objectContaining({ code: "IDENTIFIER_MISMATCH" }));
  });

  it("rejects permissions that have not been granted to the app", () => {
    // Arrange
    const input = {
      id: "example.app",
      permissions: ["MANAGE_ORDERS", "MANAGE_PRODUCTS"],
      webhooks: [],
    };

    // Act
    const act = (): ReturnType<typeof parseWebhookRefreshManifest> =>
      parseWebhookRefreshManifest({
        input,
        appIdentifier: "example.app",
        grantedPermissions: ["MANAGE_ORDERS"],
      });

    // Assert
    expect(act).toThrow(
      expect.objectContaining({
        code: "MISSING_APP_PERMISSIONS",
        details: ["MANAGE_PRODUCTS"],
      }),
    );
  });

  it("rejects duplicate manifest webhook names", () => {
    // Arrange
    const input = {
      id: "example.app",
      webhooks: [manifestWebhook, manifestWebhook],
    };

    // Act
    const act = (): ReturnType<typeof parseWebhookRefreshManifest> =>
      parseWebhookRefreshManifest({
        input,
        appIdentifier: "example.app",
        grantedPermissions: [],
      });

    // Assert
    expect(act).toThrow(
      expect.objectContaining({
        code: "DUPLICATE_MANIFEST_WEBHOOK_NAME",
      }),
    );
  });
});

describe("createWebhookSyncPlan", () => {
  it("ignores event order and query formatting", () => {
    // Arrange
    const manifestWithMultipleValues: ManifestWebhook = {
      ...manifestWebhook,
      asyncEvents: [
        WebhookEventTypeAsyncEnum.ORDER_UPDATED,
        WebhookEventTypeAsyncEnum.ORDER_CREATED,
      ],
    };
    const registeredWithMultipleValues: RegisteredWebhook = {
      ...registeredWebhook,
      asyncEvents: [
        { eventType: WebhookEventTypeAsyncEnum.ORDER_CREATED },
        { eventType: WebhookEventTypeAsyncEnum.ORDER_UPDATED },
      ],
    };

    // Act
    const plan = createWebhookSyncPlan({
      manifestWebhooks: [manifestWithMultipleValues],
      registeredWebhooks: [registeredWithMultipleValues],
    });

    // Assert
    expect(hasWebhookSyncChanges(plan)).toBe(false);
  });

  it("creates missing, updates changed, and deactivates obsolete webhooks", () => {
    // Arrange
    const newWebhook: ManifestWebhook = {
      ...manifestWebhook,
      name: "Calculate taxes",
      syncEvents: [WebhookEventTypeSyncEnum.CHECKOUT_CALCULATE_TAXES],
      asyncEvents: [],
    };
    const obsoleteWebhook: RegisteredWebhook = {
      ...registeredWebhook,
      id: "webhook-2",
      name: "Obsolete webhook",
    };

    // Act
    const plan = createWebhookSyncPlan({
      manifestWebhooks: [
        { ...manifestWebhook, targetUrl: "https://example.com/webhooks/orders-v2" },
        newWebhook,
      ],
      registeredWebhooks: [registeredWebhook, obsoleteWebhook],
    });

    // Assert
    expect(plan.toCreate).toEqual([newWebhook]);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toDeactivate).toEqual([obsoleteWebhook]);
  });

  it("does not reactivate a webhook disabled outside the manifest", () => {
    // Arrange
    const disabledWebhook: RegisteredWebhook = { ...registeredWebhook, isActive: false };

    // Act
    const plan = createWebhookSyncPlan({
      manifestWebhooks: [manifestWebhook],
      registeredWebhooks: [disabledWebhook],
    });

    // Assert
    expect(hasWebhookSyncChanges(plan)).toBe(false);
  });

  it("does update an active webhook when the manifest disables it", () => {
    // Arrange
    const disabledManifestWebhook: ManifestWebhook = { ...manifestWebhook, isActive: false };

    // Act
    const plan = createWebhookSyncPlan({
      manifestWebhooks: [disabledManifestWebhook],
      registeredWebhooks: [registeredWebhook],
    });

    // Assert
    expect(plan.toUpdate).toHaveLength(1);
  });

  it("ignores obsolete webhooks that are already inactive", () => {
    // Arrange
    const inactiveObsoleteWebhook: RegisteredWebhook = {
      ...registeredWebhook,
      name: "Obsolete webhook",
      isActive: false,
    };

    // Act
    const plan = createWebhookSyncPlan({
      manifestWebhooks: [],
      registeredWebhooks: [inactiveObsoleteWebhook],
    });

    // Assert
    expect(hasWebhookSyncChanges(plan)).toBe(false);
  });
});

describe("executeWebhookSyncPlan", () => {
  it("creates, updates, and deactivates in order without deleting records", async () => {
    // Arrange
    const calls: string[] = [];
    const changedWebhook: ManifestWebhook = {
      ...manifestWebhook,
      targetUrl: "https://example.com/webhooks/order-created-v2",
    };
    const newWebhook: ManifestWebhook = { ...manifestWebhook, name: "New webhook" };
    const obsoleteWebhook: RegisteredWebhook = {
      ...registeredWebhook,
      id: "webhook-2",
      name: "Obsolete webhook",
    };
    const plan = createWebhookSyncPlan({
      manifestWebhooks: [changedWebhook, newWebhook],
      registeredWebhooks: [registeredWebhook, obsoleteWebhook],
    });
    const operations = {
      create: jest.fn(async input => {
        calls.push(`create:${input.name}`);
      }),
      update: jest.fn(async (id, input) => {
        calls.push(`update:${id}:${input.isActive ?? "unchanged"}`);
      }),
    };

    // Act
    await executeWebhookSyncPlan({ appId: "app-1", operations, plan });

    // Assert
    expect(calls).toEqual([
      "create:New webhook",
      "update:webhook-1:true",
      "update:webhook-2:false",
    ]);
    expect(operations.update.mock.calls[0][1]).not.toHaveProperty("customHeaders");
  });

  it("stops after an error without trying to roll changes back", async () => {
    // Arrange
    const plan = createWebhookSyncPlan({
      manifestWebhooks: [
        { ...manifestWebhook, name: "First webhook" },
        { ...manifestWebhook, name: "Second webhook" },
      ],
      registeredWebhooks: [],
    });
    const operations = {
      create: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Request failed")),
      update: jest.fn(),
    };

    // Act
    const act = executeWebhookSyncPlan({ appId: "app-1", operations, plan });

    // Assert
    await expect(act).rejects.toThrow("Request failed");
    expect(operations.create).toHaveBeenCalledTimes(2);
    expect(operations.update).not.toHaveBeenCalled();
  });
});
