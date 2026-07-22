import BackButton from "@dashboard/components/BackButton";
import { Callout } from "@dashboard/components/Callout/Callout";
import {
  ConfirmButton,
  type ConfirmButtonTransitionState,
} from "@dashboard/components/ConfirmButton";
import { DashboardModal } from "@dashboard/components/Modal";
import { Box, Text } from "@saleor/macaw-ui-next";
import { type ReactElement } from "react";
import { useIntl } from "react-intl";

import { webhookManifestMessages as messages } from "./messages";
import { type WebhookSyncPlan } from "./webhookManifestSync";

interface WebhookManifestSyncDialogProps {
  confirmButtonState: ConfirmButtonTransitionState;
  open: boolean;
  plan: WebhookSyncPlan | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const WebhookManifestSyncDialog = ({
  confirmButtonState,
  open,
  plan,
  onClose,
  onConfirm,
}: WebhookManifestSyncDialogProps): ReactElement => {
  const intl = useIntl();
  const isApplying = confirmButtonState === "loading";
  const sections = plan
    ? [
        {
          key: "create",
          title: intl.formatMessage(messages.create, { count: plan.toCreate.length }),
          names: plan.toCreate.map(({ name }) => name),
        },
        {
          key: "update",
          title: intl.formatMessage(messages.update, { count: plan.toUpdate.length }),
          names: plan.toUpdate.map(({ manifestWebhook }) => manifestWebhook.name),
        },
        {
          key: "deactivate",
          title: intl.formatMessage(messages.deactivate, { count: plan.toDeactivate.length }),
          names: plan.toDeactivate.map(({ id, name }) => name || id),
        },
      ].filter(({ names }) => names.length > 0)
    : [];

  const handleClose = (): void => {
    if (!isApplying) {
      onClose();
    }
  };

  return (
    <DashboardModal onChange={handleClose} open={open}>
      <DashboardModal.Content size="sm">
        <DashboardModal.Header subtitle={intl.formatMessage(messages.dialogDescription)}>
          {intl.formatMessage(messages.dialogTitle)}
        </DashboardModal.Header>
        <DashboardModal.Body>
          <DashboardModal.Inset>
            <Box display="flex" flexDirection="column" gap={5}>
              {plan && plan.toDeactivate.length > 0 ? (
                <Callout title={intl.formatMessage(messages.deactivateWarningTitle)} type="warning">
                  {intl.formatMessage(messages.deactivateWarningDescription)}
                </Callout>
              ) : null}
              <Box
                display="flex"
                flexDirection="column"
                gap={4}
                __maxHeight="50vh"
                overflowY="auto"
              >
                {sections.map(section => (
                  <Box key={section.key}>
                    <Text size={4} fontWeight="bold" display="block" marginBottom={2}>
                      {section.title}
                    </Text>
                    <Box as="ul" margin={0} paddingLeft={5}>
                      {section.names.map(name => (
                        <li key={name}>
                          <Text size={3}>{name}</Text>
                        </li>
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </DashboardModal.Inset>
        </DashboardModal.Body>
        <DashboardModal.Actions>
          <BackButton disabled={isApplying} onClick={handleClose} />
          <ConfirmButton
            data-test-id="refresh-webhooks-confirm"
            disabled={isApplying}
            onClick={onConfirm}
            transitionState={confirmButtonState}
          >
            {intl.formatMessage(messages.confirmRefresh)}
          </ConfirmButton>
        </DashboardModal.Actions>
      </DashboardModal.Content>
    </DashboardModal>
  );
};

WebhookManifestSyncDialog.displayName = "WebhookManifestSyncDialog";
