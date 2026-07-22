import { WebhookEventTypeAsyncEnum } from "@dashboard/graphql";
import Wrapper from "@test/wrapper";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  type ManifestWebhook,
  type RegisteredWebhook,
  type WebhookSyncPlan,
} from "./webhookManifestSync";
import { WebhookManifestSyncDialog } from "./WebhookManifestSyncDialog";

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
  name: "Old order webhook",
  targetUrl: "https://example.com/webhooks/old-orders",
  subscriptionQuery: "subscription { event { __typename } }",
  isActive: true,
  asyncEvents: [{ eventType: WebhookEventTypeAsyncEnum.ORDER_CREATED }],
  syncEvents: [],
};

const plan: WebhookSyncPlan = {
  toCreate: [manifestWebhook],
  toUpdate: [],
  toDeactivate: [registeredWebhook],
};

describe("WebhookManifestSyncDialog", () => {
  it("shows the planned changes and deactivation warning", () => {
    // Arrange
    render(
      <Wrapper>
        <WebhookManifestSyncDialog
          confirmButtonState="default"
          open={true}
          plan={plan}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
        />
      </Wrapper>,
    );

    // Act
    const dialog = screen.getByRole("dialog");

    // Assert
    expect(dialog).toHaveTextContent("Create ({count})");
    expect(dialog).toHaveTextContent("Order created");
    expect(dialog).toHaveTextContent("Deactivate ({count})");
    expect(dialog).toHaveTextContent("Old order webhook");
    expect(dialog).toHaveTextContent("Dashboard won't delete");
  });

  it("confirms the refresh", async () => {
    // Arrange
    const onConfirm = jest.fn();
    const user = userEvent.setup();

    render(
      <Wrapper>
        <WebhookManifestSyncDialog
          confirmButtonState="default"
          open={true}
          plan={plan}
          onClose={jest.fn()}
          onConfirm={onConfirm}
        />
      </Wrapper>,
    );

    // Act
    await user.click(screen.getByTestId("refresh-webhooks-confirm"));

    // Assert
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
