import {
  type WebhookCreateInput,
  WebhookEventTypeAsyncEnum,
  WebhookEventTypeSyncEnum,
  type WebhookUpdateInput,
} from "@dashboard/graphql";
import { parse, print } from "graphql";
import { z } from "zod";

const isGraphqlDocument = (value: string): boolean => {
  try {
    parse(value);

    return true;
  } catch {
    return false;
  }
};

const manifestWebhookSchema = z.object({
  name: z.string().min(1),
  targetUrl: z.string().url(),
  query: z.string().min(1).refine(isGraphqlDocument),
  isActive: z.boolean().optional().default(true),
  asyncEvents: z.array(z.nativeEnum(WebhookEventTypeAsyncEnum)).optional().default([]),
  syncEvents: z.array(z.nativeEnum(WebhookEventTypeSyncEnum)).optional().default([]),
});

const manifestSchema = z.object({
  id: z.string().min(1),
  permissions: z
    .array(z.string())
    .nullish()
    .transform(value => value ?? []),
  webhooks: z
    .array(manifestWebhookSchema)
    .nullish()
    .transform(value => value ?? []),
});

export type ManifestWebhook = z.infer<typeof manifestWebhookSchema>;
export type WebhookRefreshManifest = z.infer<typeof manifestSchema>;

export interface RegisteredWebhook {
  id: string;
  name: string | null;
  isActive: boolean;
  targetUrl: string;
  subscriptionQuery: string | null;
  asyncEvents: ReadonlyArray<{ eventType: WebhookEventTypeAsyncEnum }>;
  syncEvents: ReadonlyArray<{ eventType: WebhookEventTypeSyncEnum }>;
}

export interface WebhookSyncPlan {
  toCreate: ManifestWebhook[];
  toUpdate: Array<{
    registeredWebhook: RegisteredWebhook;
    manifestWebhook: ManifestWebhook;
  }>;
  toDeactivate: RegisteredWebhook[];
}

export type WebhookManifestRefreshErrorCode =
  | "DUPLICATE_MANIFEST_WEBHOOK_NAME"
  | "DUPLICATE_REGISTERED_WEBHOOK_NAME"
  | "IDENTIFIER_MISMATCH"
  | "INVALID_MANIFEST"
  | "MANIFEST_UNAVAILABLE"
  | "MISSING_APP_PERMISSIONS";

export class WebhookManifestRefreshError extends Error {
  readonly code: WebhookManifestRefreshErrorCode;

  readonly details: string[];

  constructor(code: WebhookManifestRefreshErrorCode, details: string[] = []) {
    super(code);
    this.name = "WebhookManifestRefreshError";
    this.code = code;
    this.details = details;
  }
}

const findDuplicateNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  names.forEach(name => {
    if (seen.has(name)) {
      duplicates.add(name);
    }

    seen.add(name);
  });

  return [...duplicates];
};

export const parseWebhookRefreshManifest = ({
  input,
  appIdentifier,
  grantedPermissions,
}: {
  input: unknown;
  appIdentifier: string;
  grantedPermissions: string[];
}): WebhookRefreshManifest => {
  const parsed = manifestSchema.safeParse(input);

  if (!parsed.success) {
    throw new WebhookManifestRefreshError("INVALID_MANIFEST");
  }

  if (parsed.data.id !== appIdentifier) {
    throw new WebhookManifestRefreshError("IDENTIFIER_MISMATCH");
  }

  const grantedPermissionSet = new Set(grantedPermissions);
  const missingPermissions = parsed.data.permissions.filter(
    permission => !grantedPermissionSet.has(permission),
  );

  if (missingPermissions.length > 0) {
    throw new WebhookManifestRefreshError("MISSING_APP_PERMISSIONS", missingPermissions);
  }

  const duplicateNames = findDuplicateNames(parsed.data.webhooks.map(({ name }) => name));

  if (duplicateNames.length > 0) {
    throw new WebhookManifestRefreshError("DUPLICATE_MANIFEST_WEBHOOK_NAME", duplicateNames);
  }

  return parsed.data;
};

const normalizeQuery = (query: string): string => {
  try {
    return print(parse(query));
  } catch {
    return query.trim();
  }
};

const normalizeEvents = (events: ReadonlyArray<string>): string => [...events].sort().join("|");

const webhookNeedsUpdate = (
  registeredWebhook: RegisteredWebhook,
  manifestWebhook: ManifestWebhook,
): boolean => {
  const registeredAsyncEvents = registeredWebhook.asyncEvents.map(({ eventType }) => eventType);
  const registeredSyncEvents = registeredWebhook.syncEvents.map(({ eventType }) => eventType);

  return (
    registeredWebhook.targetUrl !== manifestWebhook.targetUrl ||
    normalizeQuery(registeredWebhook.subscriptionQuery ?? "") !==
      normalizeQuery(manifestWebhook.query) ||
    normalizeEvents(registeredAsyncEvents) !== normalizeEvents(manifestWebhook.asyncEvents) ||
    normalizeEvents(registeredSyncEvents) !== normalizeEvents(manifestWebhook.syncEvents) ||
    (registeredWebhook.isActive && !manifestWebhook.isActive)
  );
};

export const createWebhookSyncPlan = ({
  manifestWebhooks,
  registeredWebhooks,
}: {
  manifestWebhooks: ManifestWebhook[];
  registeredWebhooks: RegisteredWebhook[];
}): WebhookSyncPlan => {
  const registeredNames = registeredWebhooks.flatMap(({ name }) => (name ? [name] : []));
  const duplicateRegisteredNames = findDuplicateNames(registeredNames);

  if (duplicateRegisteredNames.length > 0) {
    throw new WebhookManifestRefreshError(
      "DUPLICATE_REGISTERED_WEBHOOK_NAME",
      duplicateRegisteredNames,
    );
  }

  const registeredByName = new Map(
    registeredWebhooks.flatMap(webhook => (webhook.name ? [[webhook.name, webhook] as const] : [])),
  );
  const manifestNames = new Set(manifestWebhooks.map(({ name }) => name));
  const plan: WebhookSyncPlan = {
    toCreate: [],
    toUpdate: [],
    toDeactivate: [],
  };

  manifestWebhooks.forEach(manifestWebhook => {
    const registeredWebhook = registeredByName.get(manifestWebhook.name);

    if (!registeredWebhook) {
      plan.toCreate.push(manifestWebhook);

      return;
    }

    if (webhookNeedsUpdate(registeredWebhook, manifestWebhook)) {
      plan.toUpdate.push({ registeredWebhook, manifestWebhook });
    }
  });

  registeredWebhooks.forEach(registeredWebhook => {
    if (
      registeredWebhook.isActive &&
      (!registeredWebhook.name || !manifestNames.has(registeredWebhook.name))
    ) {
      plan.toDeactivate.push(registeredWebhook);
    }
  });

  return plan;
};

export const hasWebhookSyncChanges = (plan: WebhookSyncPlan): boolean =>
  plan.toCreate.length > 0 || plan.toUpdate.length > 0 || plan.toDeactivate.length > 0;

interface WebhookSyncOperations {
  create: (input: WebhookCreateInput) => Promise<void>;
  update: (id: string, input: WebhookUpdateInput) => Promise<void>;
}

export const executeWebhookSyncPlan = async ({
  appId,
  operations,
  plan,
}: {
  appId: string;
  operations: WebhookSyncOperations;
  plan: WebhookSyncPlan;
}): Promise<void> => {
  for (const manifestWebhook of plan.toCreate) {
    await operations.create({
      app: appId,
      asyncEvents: manifestWebhook.asyncEvents,
      syncEvents: manifestWebhook.syncEvents,
      isActive: manifestWebhook.isActive,
      name: manifestWebhook.name,
      targetUrl: manifestWebhook.targetUrl,
      query: manifestWebhook.query,
    });
  }

  for (const { registeredWebhook, manifestWebhook } of plan.toUpdate) {
    await operations.update(registeredWebhook.id, {
      asyncEvents: manifestWebhook.asyncEvents,
      syncEvents: manifestWebhook.syncEvents,
      isActive: registeredWebhook.isActive && manifestWebhook.isActive,
      name: manifestWebhook.name,
      targetUrl: manifestWebhook.targetUrl,
      query: manifestWebhook.query,
    });
  }

  for (const registeredWebhook of plan.toDeactivate) {
    await operations.update(registeredWebhook.id, { isActive: false });
  }
};
