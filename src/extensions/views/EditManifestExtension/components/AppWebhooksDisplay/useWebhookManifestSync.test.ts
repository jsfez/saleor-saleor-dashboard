import { WebhookEventTypeAsyncEnum } from "@dashboard/graphql";

import { fetchWebhookRefreshManifest } from "./useWebhookManifestSync";

const mockFetch = jest.fn();

global.fetch = mockFetch;

describe("fetchWebhookRefreshManifest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches the manifest without browser credentials and parses its webhooks", async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({
        id: "example.app",
        webhooks: [
          {
            name: "Order created",
            targetUrl: "https://example.com/webhooks/order-created",
            query: "subscription { event { __typename } }",
            asyncEvents: [WebhookEventTypeAsyncEnum.ORDER_CREATED],
          },
        ],
      }),
    });

    // Act
    const manifest = await fetchWebhookRefreshManifest({
      appIdentifier: "example.app",
      grantedPermissions: [],
      manifestUrl: "https://example.com/api/manifest",
    });

    // Assert
    expect(manifest.webhooks).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/api/manifest",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
      }),
    );
  });

  it("reports a browser fetch failure as an unavailable manifest", async () => {
    // Arrange
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    // Act
    const result = fetchWebhookRefreshManifest({
      appIdentifier: "example.app",
      grantedPermissions: [],
      manifestUrl: "https://example.com/api/manifest",
    });

    // Assert
    await expect(result).rejects.toEqual(expect.objectContaining({ code: "MANIFEST_UNAVAILABLE" }));
  });

  it("reports a non-JSON response as an invalid manifest", async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockRejectedValueOnce(new SyntaxError("Unexpected token")),
    });

    // Act
    const result = fetchWebhookRefreshManifest({
      appIdentifier: "example.app",
      grantedPermissions: [],
      manifestUrl: "https://example.com/api/manifest",
    });

    // Assert
    await expect(result).rejects.toEqual(expect.objectContaining({ code: "INVALID_MANIFEST" }));
  });
});
