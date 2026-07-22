import { WebhookEventTypeAsyncEnum } from "@dashboard/graphql";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { type WebhookSyncPlan } from "./webhookManifestSync";
import { WebhookManifestSyncDialog } from "./WebhookManifestSyncDialog";

const plan: WebhookSyncPlan = {
  toCreate: [
    {
      name: "Order created",
      targetUrl: "https://example.com/webhooks/order-created",
      query: "subscription { event { __typename } }",
      isActive: true,
      asyncEvents: [WebhookEventTypeAsyncEnum.ORDER_CREATED],
      syncEvents: [],
    },
  ],
  toUpdate: [],
  toDeactivate: [
    {
      id: "webhook-1",
      name: "Legacy order webhook",
      targetUrl: "https://example.com/webhooks/legacy-order",
      subscriptionQuery: "subscription { event { __typename } }",
      isActive: true,
      asyncEvents: [{ eventType: WebhookEventTypeAsyncEnum.ORDER_CREATED }],
      syncEvents: [],
    },
  ],
};

const meta: Meta<typeof WebhookManifestSyncDialog> = {
  title: "Extensions/EditManifestExtension/WebhookManifestSyncDialog",
  component: WebhookManifestSyncDialog,
  args: {
    confirmButtonState: "default",
    open: true,
    plan,
    onClose: fn(),
    onConfirm: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof WebhookManifestSyncDialog>;

export const Default: Story = {};

export const Applying: Story = {
  args: { confirmButtonState: "loading" },
};
