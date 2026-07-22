import type * as DashboardGraphqlTypes from "@dashboard/graphql";
import { WebhookEventTypeAsyncEnum } from "@dashboard/graphql";
import Wrapper from "@test/wrapper";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppWebhooksDisplay } from "./AppWebhooksDisplay";
import { WebhookManifestRefreshError, type WebhookSyncPlan } from "./webhookManifestSync";

const mockUseAppWebhookDeliveriesQuery = jest.fn();
const mockUseWebhookManifestSync = jest.fn();

class ResizeObserverMock {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

global.ResizeObserver = ResizeObserverMock;

jest.mock("@dashboard/graphql", () => ({
  ...jest.requireActual<typeof DashboardGraphqlTypes>("@dashboard/graphql"),
  useAppWebhookDeliveriesQuery: (...args: unknown[]): unknown =>
    mockUseAppWebhookDeliveriesQuery(...args),
}));

jest.mock("@dashboard/hooks/useHasManagedAppsPermission", () => ({
  useHasManagedAppsPermission: (): { hasManagedAppsPermission: boolean } => ({
    hasManagedAppsPermission: true,
  }),
}));

jest.mock("@dashboard/hooks/useNotifier", () => ({
  useNotifier: (): jest.Mock => jest.fn(),
}));

jest.mock("./useWebhookManifestSync", () => ({
  useWebhookManifestSync: (...args: unknown[]): unknown => mockUseWebhookManifestSync(...args),
}));

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
  toDeactivate: [],
};

describe("AppWebhooksDisplay manifest refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppWebhookDeliveriesQuery.mockReturnValue({
      data: { app: { webhooks: [] } },
      loading: false,
      refetch: jest.fn(),
    });
    mockUseWebhookManifestSync.mockReturnValue({
      applyRefresh: jest.fn(),
      checkError: null,
      checkStatus: "ready",
      isApplying: false,
      isPreparing: false,
      plan,
      prepareRefresh: jest.fn().mockResolvedValue(plan),
    });
  });

  it("shows a mismatch indicator with an explanation", async () => {
    // Arrange
    const user = userEvent.setup();

    render(
      <Wrapper>
        <AppWebhooksDisplay
          appId="app-1"
          appIdentifier="example.app"
          appPermissions={[]}
          manifestUrl="https://example.com/api/manifest"
        />
      </Wrapper>,
    );

    // Act
    await user.hover(screen.getByTestId("webhook-manifest-status"));

    // Assert
    const explanations = await screen.findAllByText(
      "{count, plural, one {Webhooks differ from the manifest in one place.} other {Webhooks differ from the manifest in # places.}}",
    );

    expect(explanations[0]).toBeVisible();
  });

  it("opens the confirmation dialog with a freshly prepared plan", async () => {
    // Arrange
    const user = userEvent.setup();

    render(
      <Wrapper>
        <AppWebhooksDisplay
          appId="app-1"
          appIdentifier="example.app"
          appPermissions={[]}
          manifestUrl="https://example.com/api/manifest"
        />
      </Wrapper>,
    );

    // Act
    await user.click(screen.getByTestId("refresh-webhooks-button"));

    // Assert
    expect(await screen.findByRole("dialog")).toHaveTextContent("Order created");
  });

  it("disables refresh and puts an unavailable manifest error on the button", async () => {
    // Arrange
    const user = userEvent.setup();

    mockUseWebhookManifestSync.mockReturnValue({
      applyRefresh: jest.fn(),
      checkError: new WebhookManifestRefreshError("MANIFEST_UNAVAILABLE"),
      checkStatus: "error",
      isApplying: false,
      isPreparing: false,
      plan: null,
      prepareRefresh: jest.fn(),
    });

    render(
      <Wrapper>
        <AppWebhooksDisplay
          appId="app-1"
          appIdentifier="example.app"
          appPermissions={[]}
          manifestUrl="https://example.com/api/manifest"
        />
      </Wrapper>,
    );

    const refreshButton = screen.getByTestId("refresh-webhooks-button");
    const tooltipTrigger = refreshButton.parentElement;

    if (!tooltipTrigger) {
      throw new Error("Expected the disabled refresh button to have a tooltip trigger");
    }

    // Act
    await user.hover(tooltipTrigger);

    // Assert
    expect(refreshButton).toBeDisabled();
    expect(tooltipTrigger).toHaveAttribute("data-state");
    expect(screen.queryByTestId("webhook-manifest-status")).not.toBeInTheDocument();

    const explanations = await screen.findAllByText(
      "Dashboard couldn't read this extension's manifest. Refresh requires the manifest to allow browser access.",
    );

    expect(explanations[0]).toBeVisible();
    expect(explanations[0].closest("[data-side]")).toHaveAttribute("data-side", "right");
  });
});
