import {
  type AppWebhookDeliveriesQuery,
  useWebhookCreateMutation,
  useWebhookUpdateMutation,
  type WebhookCreateInput,
  type WebhookUpdateInput,
} from "@dashboard/graphql";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createWebhookSyncPlan,
  executeWebhookSyncPlan,
  parseWebhookRefreshManifest,
  type RegisteredWebhook,
  WebhookManifestRefreshError,
  type WebhookRefreshManifest,
  type WebhookSyncPlan,
} from "./webhookManifestSync";

const MANIFEST_FETCH_TIMEOUT = 10_000;

type ManifestCheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; manifest: WebhookRefreshManifest }
  | { status: "error"; error: WebhookManifestRefreshError };

type RefetchWebhooks = () => Promise<{ data: AppWebhookDeliveriesQuery }>;

interface UseWebhookManifestSyncResult {
  applyRefresh: (plan: WebhookSyncPlan) => Promise<void>;
  checkError: WebhookManifestRefreshError | null;
  checkStatus: ManifestCheckState["status"];
  isApplying: boolean;
  isPreparing: boolean;
  plan: WebhookSyncPlan | null;
  prepareRefresh: () => Promise<WebhookSyncPlan>;
}

const getManifestRefreshError = (error: unknown): WebhookManifestRefreshError =>
  error instanceof WebhookManifestRefreshError
    ? error
    : new WebhookManifestRefreshError("MANIFEST_UNAVAILABLE");

const fetchManifestResponse = async ({
  manifestUrl,
  signal,
}: {
  manifestUrl: string;
  signal?: AbortSignal;
}): Promise<unknown> => {
  const controller = new AbortController();
  const abortRequest = (): void => controller.abort();
  const timeout = setTimeout(abortRequest, MANIFEST_FETCH_TIMEOUT);

  signal?.addEventListener("abort", abortRequest, { once: true });

  try {
    let response: Response;

    try {
      response = await fetch(manifestUrl, {
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json" },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch {
      throw new Error("MANIFEST_UNAVAILABLE");
    }

    if (!response.ok) {
      throw new Error("MANIFEST_UNAVAILABLE");
    }

    try {
      return await response.json();
    } catch {
      throw new Error("INVALID_MANIFEST");
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }
};

export const fetchWebhookRefreshManifest = async ({
  appIdentifier,
  grantedPermissions,
  manifestUrl,
  signal,
}: {
  appIdentifier: string;
  grantedPermissions: string[];
  manifestUrl: string;
  signal?: AbortSignal;
}): Promise<WebhookRefreshManifest> => {
  try {
    const input = await fetchManifestResponse({ manifestUrl, signal });

    return parseWebhookRefreshManifest({ input, appIdentifier, grantedPermissions });
  } catch (error) {
    if (error instanceof WebhookManifestRefreshError) {
      throw error;
    }

    const code =
      error instanceof Error && error.message === "INVALID_MANIFEST"
        ? "INVALID_MANIFEST"
        : "MANIFEST_UNAVAILABLE";

    throw new WebhookManifestRefreshError(code);
  }
};

const getRegisteredWebhooks = (data: AppWebhookDeliveriesQuery): RegisteredWebhook[] =>
  data.app?.webhooks ?? [];

const getMutationError = (
  errors: ReadonlyArray<{ message?: string | null }>,
  webhookExists: boolean,
): Error | null => {
  const firstError = errors[0];

  if (firstError) {
    return new Error(firstError.message ?? "Webhook mutation failed");
  }

  return webhookExists ? null : new Error("Webhook mutation returned no webhook");
};

export const useWebhookManifestSync = ({
  appId,
  appIdentifier,
  enabled,
  grantedPermissions,
  manifestUrl,
  refetchWebhooks,
  registeredWebhooks,
}: {
  appId: string;
  appIdentifier: string | null;
  enabled: boolean;
  grantedPermissions: string[];
  manifestUrl: string | null;
  refetchWebhooks: RefetchWebhooks;
  registeredWebhooks: RegisteredWebhook[];
}): UseWebhookManifestSyncResult => {
  const [checkState, setCheckState] = useState<ManifestCheckState>({ status: "idle" });
  const [isPreparing, setIsPreparing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [webhookCreate] = useWebhookCreateMutation();
  const [webhookUpdate] = useWebhookUpdateMutation();
  const grantedPermissionsKey = [...grantedPermissions].sort().join("|");

  const readManifest = useCallback(
    async (signal?: AbortSignal): Promise<WebhookRefreshManifest> => {
      if (!appIdentifier || !manifestUrl) {
        throw new Error("Missing app manifest details");
      }

      return fetchWebhookRefreshManifest({
        appIdentifier,
        grantedPermissions: grantedPermissionsKey ? grantedPermissionsKey.split("|") : [],
        manifestUrl,
        signal,
      });
    },
    [appIdentifier, grantedPermissionsKey, manifestUrl],
  );

  const checkManifest = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setCheckState({ status: "loading" });

      try {
        const manifest = await readManifest(signal);

        if (!signal?.aborted) {
          setCheckState({ status: "ready", manifest });
        }
      } catch (error) {
        if (!signal?.aborted) {
          setCheckState({ status: "error", error: getManifestRefreshError(error) });
        }
      }
    },
    [readManifest],
  );

  useEffect(
    function checkManifestOnLoad() {
      if (!enabled || !appIdentifier || !manifestUrl) {
        setCheckState({ status: "idle" });

        return;
      }

      const controller = new AbortController();

      void checkManifest(controller.signal);

      return function abortManifestCheck(): void {
        controller.abort();
      };
    },
    [appIdentifier, checkManifest, enabled, manifestUrl],
  );

  const planResult = useMemo<{
    plan: WebhookSyncPlan | null;
    error: WebhookManifestRefreshError | null;
  }>(() => {
    if (checkState.status !== "ready") {
      return { plan: null, error: null };
    }

    try {
      return {
        plan: createWebhookSyncPlan({
          manifestWebhooks: checkState.manifest.webhooks,
          registeredWebhooks,
        }),
        error: null,
      };
    } catch (error) {
      return { plan: null, error: getManifestRefreshError(error) };
    }
  }, [checkState, registeredWebhooks]);

  const prepareRefresh = useCallback(async (): Promise<WebhookSyncPlan> => {
    setIsPreparing(true);

    try {
      const [manifest, webhooksResult] = await Promise.all([readManifest(), refetchWebhooks()]);
      const plan = createWebhookSyncPlan({
        manifestWebhooks: manifest.webhooks,
        registeredWebhooks: getRegisteredWebhooks(webhooksResult.data),
      });

      setCheckState({ status: "ready", manifest });

      return plan;
    } catch (error) {
      if (error instanceof WebhookManifestRefreshError) {
        setCheckState({ status: "error", error });
      }

      throw error;
    } finally {
      setIsPreparing(false);
    }
  }, [readManifest, refetchWebhooks]);

  const createWebhook = useCallback(
    async (input: WebhookCreateInput): Promise<void> => {
      const result = await webhookCreate({ variables: { input } });
      const errors = result.data?.webhookCreate?.errors ?? [];
      const mutationError = getMutationError(errors, Boolean(result.data?.webhookCreate?.webhook));

      if (mutationError) {
        throw mutationError;
      }
    },
    [webhookCreate],
  );
  const updateWebhook = useCallback(
    async (id: string, input: WebhookUpdateInput): Promise<void> => {
      const result = await webhookUpdate({ variables: { id, input } });
      const errors = result.data?.webhookUpdate?.errors ?? [];
      const mutationError = getMutationError(errors, Boolean(result.data?.webhookUpdate?.webhook));

      if (mutationError) {
        throw mutationError;
      }
    },
    [webhookUpdate],
  );

  const applyRefresh = useCallback(
    async (plan: WebhookSyncPlan): Promise<void> => {
      setIsApplying(true);

      try {
        await executeWebhookSyncPlan({
          appId,
          operations: { create: createWebhook, update: updateWebhook },
          plan,
        });
      } finally {
        await refetchWebhooks().catch((): undefined => undefined);
        setIsApplying(false);
      }
    },
    [appId, createWebhook, refetchWebhooks, updateWebhook],
  );

  return {
    applyRefresh,
    checkError: checkState.status === "error" ? checkState.error : planResult.error,
    checkStatus: checkState.status,
    isApplying,
    isPreparing,
    plan: planResult.plan,
    prepareRefresh,
  };
};
