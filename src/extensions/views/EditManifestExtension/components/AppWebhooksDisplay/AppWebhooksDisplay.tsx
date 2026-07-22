import { ButtonWithTooltip } from "@dashboard/components/ButtonWithTooltip";
import { useAppWebhookDeliveriesQuery } from "@dashboard/graphql";
import { useHasManagedAppsPermission } from "@dashboard/hooks/useHasManagedAppsPermission";
import { useNotifier } from "@dashboard/hooks/useNotifier";
import { buttonMessages } from "@dashboard/intl";
import {
  Accordion,
  Box,
  type BoxProps,
  Chip,
  Skeleton,
  Text,
  Tooltip,
} from "@saleor/macaw-ui-next";
import { CircleAlert, RefreshCw } from "lucide-react";
import { type ReactElement, type ReactNode, useCallback, useState } from "react";
import { FormattedMessage, type IntlShape, useIntl } from "react-intl";

import messages from "../AppDetailsPage/messages";
import { EventDeliveriesList } from "./EventDeliveriesList";
import { webhookManifestMessages } from "./messages";
import { useWebhookManifestSync } from "./useWebhookManifestSync";
import { sortWebhooksByDeliveries } from "./utils";
import {
  hasWebhookSyncChanges,
  WebhookManifestRefreshError,
  type WebhookSyncPlan,
} from "./webhookManifestSync";
import { WebhookManifestSyncDialog } from "./WebhookManifestSyncDialog";

interface AppWebhooksDisplayProps extends BoxProps {
  appId: string;
  appIdentifier: string | null;
  appPermissions: string[];
  manifestUrl: string | null;
}

interface WrapperProps {
  action?: ReactNode;
  boxProps: BoxProps;
  children: ReactNode;
  status?: ReactNode;
}

const Wrapper = ({ action, boxProps, children, status }: WrapperProps): ReactElement => {
  const intl = useIntl();

  return (
    <Box {...boxProps}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={4}>
        <Box>
          <Box display="flex" alignItems="center" gap={2} marginBottom={4}>
            <Text size={5} fontWeight="bold" as={"h2"}>
              <FormattedMessage {...messages.appWebhooksTitle} />
            </Text>
            {status}
          </Box>
          <Text>
            {intl.formatMessage({
              defaultMessage:
                "All webhooks registered by this extension. In case of failed webhook delivery, list of attempts is displayed.",
              id: "hjEkEH",
            })}
          </Text>
        </Box>
        {action}
      </Box>
      <Box marginTop={6}>{children}</Box>
    </Box>
  );
};

const DisabledWebhookChip = (): ReactElement => {
  const { formatMessage } = useIntl();

  return (
    <Chip backgroundColor="default1">
      <Text color="default1">
        {formatMessage({
          defaultMessage: "Disabled",
          id: "tthToS",
        })}
      </Text>
    </Chip>
  );
};
/**
 * Refresh webhooks deliveries every 5 seconds
 */
const REFRESH_INTERVAL = 5000;

export const AppWebhooksDisplay = ({
  appId,
  appIdentifier,
  appPermissions,
  manifestUrl,
  ...boxProps
}: AppWebhooksDisplayProps): ReactElement | null => {
  const intl = useIntl();
  const { formatMessage } = intl;
  const notify = useNotifier();
  const { hasManagedAppsPermission } = useHasManagedAppsPermission();
  const {
    data: webhooksData,
    loading,
    refetch,
  } = useAppWebhookDeliveriesQuery({
    variables: { appId },
    skip: !hasManagedAppsPermission,
    pollInterval: REFRESH_INTERVAL,
  });
  const registeredWebhooks = webhooksData?.app?.webhooks ?? [];
  const [pendingPlan, setPendingPlan] = useState<WebhookSyncPlan | null>(null);
  const { applyRefresh, checkError, checkStatus, isApplying, isPreparing, plan, prepareRefresh } =
    useWebhookManifestSync({
      appId,
      appIdentifier,
      enabled: hasManagedAppsPermission && !loading && Boolean(webhooksData?.app),
      grantedPermissions: appPermissions,
      manifestUrl,
      refetchWebhooks: refetch,
      registeredWebhooks,
    });

  const getErrorMessage = useCallback(
    (error: WebhookManifestRefreshError, intl: IntlShape): string => {
      switch (error.code) {
        case "IDENTIFIER_MISMATCH":
          return intl.formatMessage(webhookManifestMessages.identifierMismatch);
        case "INVALID_MANIFEST":
          return intl.formatMessage(webhookManifestMessages.invalidManifest);
        case "MISSING_APP_PERMISSIONS":
          return intl.formatMessage(webhookManifestMessages.missingPermissions, {
            permissions: error.details.join(", "),
          });
        case "DUPLICATE_MANIFEST_WEBHOOK_NAME":
        case "DUPLICATE_REGISTERED_WEBHOOK_NAME":
          return intl.formatMessage(webhookManifestMessages.duplicateNames, {
            names: error.details.join(", "),
          });
        case "MANIFEST_UNAVAILABLE":
        default:
          return intl.formatMessage(webhookManifestMessages.unavailable);
      }
    },
    [],
  );
  const changeCount = plan
    ? plan.toCreate.length + plan.toUpdate.length + plan.toDeactivate.length
    : 0;
  const hasChanges = Boolean(plan && hasWebhookSyncChanges(plan));
  const isBlockingError =
    checkError?.code === "MANIFEST_UNAVAILABLE" ||
    checkError?.code === "IDENTIFIER_MISMATCH" ||
    checkError?.code === "MISSING_APP_PERMISSIONS" ||
    checkError?.code === "DUPLICATE_MANIFEST_WEBHOOK_NAME" ||
    checkError?.code === "DUPLICATE_REGISTERED_WEBHOOK_NAME";
  const disabledTooltip = !hasManagedAppsPermission
    ? intl.formatMessage(buttonMessages.noPermission)
    : !manifestUrl || !appIdentifier
      ? intl.formatMessage(webhookManifestMessages.unavailable)
      : isBlockingError && checkError
        ? getErrorMessage(checkError, intl)
        : checkStatus === "loading"
          ? intl.formatMessage(webhookManifestMessages.checkingManifest)
          : undefined;
  const refreshDisabled =
    !hasManagedAppsPermission ||
    !manifestUrl ||
    !appIdentifier ||
    isBlockingError ||
    isPreparing ||
    isApplying ||
    checkStatus === "loading";
  const statusMessage =
    checkError?.code === "MANIFEST_UNAVAILABLE"
      ? null
      : checkError
        ? getErrorMessage(checkError, intl)
        : hasChanges
          ? intl.formatMessage(webhookManifestMessages.mismatch, { count: changeCount })
          : null;

  const handlePrepareRefresh = useCallback(async () => {
    try {
      const nextPlan = await prepareRefresh();

      if (!hasWebhookSyncChanges(nextPlan)) {
        notify({
          status: "success",
          text: intl.formatMessage(webhookManifestMessages.alreadyCurrent),
        });

        return;
      }

      setPendingPlan(nextPlan);
    } catch (error) {
      const text =
        error instanceof WebhookManifestRefreshError
          ? getErrorMessage(error, intl)
          : intl.formatMessage(webhookManifestMessages.refreshFailed);

      notify({ status: "error", text });
    }
  }, [getErrorMessage, intl, notify, prepareRefresh]);

  const handleApplyRefresh = useCallback(async () => {
    if (!pendingPlan) {
      return;
    }

    try {
      await applyRefresh(pendingPlan);
      notify({
        status: "success",
        text: intl.formatMessage(webhookManifestMessages.refreshSucceeded),
      });
    } catch {
      notify({
        status: "error",
        text: intl.formatMessage(webhookManifestMessages.refreshFailed),
      });
    } finally {
      setPendingPlan(null);
    }
  }, [applyRefresh, intl, notify, pendingPlan]);

  const action = (
    <ButtonWithTooltip
      data-test-id="refresh-webhooks-button"
      variant="secondary"
      size="small"
      display="flex"
      alignItems="center"
      gap={1.5}
      disabled={refreshDisabled}
      tooltip={disabledTooltip ? <Text size={2}>{disabledTooltip}</Text> : undefined}
      tooltipSide="right"
      onClick={handlePrepareRefresh}
    >
      <RefreshCw size={16} />
      {intl.formatMessage(webhookManifestMessages.refreshButton)}
    </ButtonWithTooltip>
  );
  const status = statusMessage ? (
    <Tooltip>
      <Tooltip.Trigger>
        <Box
          as="span"
          color={checkError ? "critical1" : "warning1"}
          display="inline-flex"
          alignItems="center"
          aria-label={statusMessage}
          data-test-id="webhook-manifest-status"
        >
          <CircleAlert size={16} />
        </Box>
      </Tooltip.Trigger>
      <Tooltip.Content side="right">
        <Tooltip.Arrow />
        <Text size={2}>{statusMessage}</Text>
      </Tooltip.Content>
    </Tooltip>
  ) : null;

  if (loading) {
    return (
      <Wrapper boxProps={boxProps}>
        <Skeleton height={8} marginBottom={4} />
        <Skeleton height={8} marginBottom={4} />
        <Skeleton height={8} />
      </Wrapper>
    );
  }

  if (webhooksData?.app?.webhooks) {
    const webhooks = [...webhooksData.app.webhooks];
    const sortedWebhooks = webhooks.sort(sortWebhooksByDeliveries);

    const alertsWithDeliveriesIds = sortedWebhooks
      .filter(wh => (wh.eventDeliveries?.edges.length || 0) > 0)
      .map(({ id }) => id)
      .splice(0, 1); // Display only first webhook with deliveries

    return (
      <>
        <WebhookManifestSyncDialog
          confirmButtonState={isApplying ? "loading" : "default"}
          open={pendingPlan !== null}
          plan={pendingPlan}
          onClose={() => setPendingPlan(null)}
          onConfirm={handleApplyRefresh}
        />
        <Wrapper boxProps={boxProps} action={action} status={status}>
          <Accordion
            __marginLeft="-24px"
            __width="calc(100% + 48px)"
            type="multiple"
            defaultValue={alertsWithDeliveriesIds}
          >
            {sortedWebhooks.map((wh, index) => {
              const isLastWebhook = index === (webhooksData?.app?.webhooks ?? []).length - 1;
              const events = [...wh.asyncEvents, ...wh.syncEvents].flatMap(e => e.name).join(", ");
              const eventDeliveries = wh.eventDeliveries?.edges ?? [];

              return (
                <Box
                  key={wh.id}
                  padding={4}
                  paddingLeft={6}
                  borderBottomWidth={isLastWebhook ? 0 : 1}
                  borderColor="default1"
                  borderBottomStyle="solid"
                >
                  <Box>
                    <Box display="flex" gap={2} alignItems="center" marginBottom={2}>
                      <Text>{wh.name}</Text>
                      {!wh.isActive ? <DisabledWebhookChip /> : null}
                    </Box>
                    <Text size={1}>{events}</Text>
                  </Box>
                  {eventDeliveries.length > 0 ? (
                    <Accordion.Item
                      value={wh.id}
                      marginTop={6}
                      borderColor="default1"
                      borderWidth={1}
                      borderStyle="solid"
                      paddingY={2}
                      borderRadius={4}
                    >
                      <Accordion.Trigger alignItems="center" paddingX={4}>
                        <Text size={4} fontWeight="bold" as="h2">
                          {formatMessage({
                            defaultMessage: "Pending & failed deliveries (last 10)",
                            id: "SRMNCS",
                          })}
                        </Text>
                        <Accordion.TriggerButton />
                      </Accordion.Trigger>
                      <Accordion.Content marginTop={6}>
                        <EventDeliveriesList eventDeliveries={eventDeliveries} />
                      </Accordion.Content>
                    </Accordion.Item>
                  ) : null}
                </Box>
              );
            })}
          </Accordion>
        </Wrapper>
      </>
    );
  }

  return null;
};
