import {
  findOpenPopupExtension,
  isOpenPopupAction,
  OPEN_POPUP_MAX_PARAMS_LENGTH,
  serializeOpenPopupParams,
} from "./open-popup";
import { type Extension } from "./types";

const makeExtension = (overrides: Partial<Extension>): Extension => ({
  id: "ext-1",
  app: {
    __typename: "App",
    id: "app-1",
    appUrl: "https://app.example.com",
    name: "Test app",
    brand: null,
  },
  accessToken: "token",
  permissions: [],
  label: "Extension",
  identifier: "main-popup",
  mountName: "ORDER_DETAILS_WIDGETS",
  url: "https://app.example.com/popup",
  open: () => undefined,
  targetName: "POPUP",
  settings: {},
  isSaleorOfficial: false,
  ...overrides,
});

describe("isOpenPopupAction", () => {
  it("accepts a well-formed openPopup action", () => {
    // Arrange
    const action = {
      type: "openPopup",
      payload: { actionId: "a-1", extensionIdentifier: "main-popup", params: { mode: "full" } },
    };

    // Act + Assert
    expect(isOpenPopupAction(action)).toBe(true);
  });

  it.each([
    ["wrong type", { type: "redirect", payload: { actionId: "a", extensionIdentifier: "x" } }],
    ["missing actionId", { type: "openPopup", payload: { extensionIdentifier: "x" } }],
    ["missing extensionIdentifier", { type: "openPopup", payload: { actionId: "a" } }],
    ["null", null],
    ["string", "openPopup"],
  ])("rejects %s", (_label, input) => {
    // Act + Assert
    expect(isOpenPopupAction(input)).toBe(false);
  });
});

describe("serializeOpenPopupParams", () => {
  it("returns undefined value when params are absent", () => {
    // Act
    const result = serializeOpenPopupParams(undefined);

    // Assert
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("serializes arbitrary nested JSON", () => {
    // Arrange
    const params = { mode: "full", ids: [1, 2], nested: { a: true } };

    // Act
    const result = serializeOpenPopupParams(params);

    // Assert
    expect(result).toEqual({ ok: true, value: JSON.stringify(params) });
  });

  it("rejects a payload over the size cap", () => {
    // Arrange
    const params = { big: "x".repeat(OPEN_POPUP_MAX_PARAMS_LENGTH) };

    // Act
    const result = serializeOpenPopupParams(params);

    // Assert
    expect(result.ok).toBe(false);
  });
});

describe("findOpenPopupExtension", () => {
  const target = { requestingAppId: "app-1", extensionIdentifier: "main-popup" };

  it("finds the matching same-app POPUP extension", () => {
    // Arrange
    const match = makeExtension({});
    const extensions = [makeExtension({ identifier: "other" }), match];

    // Act + Assert
    expect(findOpenPopupExtension(extensions, target)).toBe(match);
  });

  it("ignores extensions belonging to another app", () => {
    // Arrange
    const extensions = [makeExtension({ app: { ...makeExtension({}).app, id: "app-2" } })];

    // Act + Assert
    expect(findOpenPopupExtension(extensions, target)).toBeUndefined();
  });

  it("ignores extensions whose target is not POPUP", () => {
    // Arrange
    const extensions = [makeExtension({ targetName: "WIDGET" })];

    // Act + Assert
    expect(findOpenPopupExtension(extensions, target)).toBeUndefined();
  });

  it("ignores extensions with a different identifier", () => {
    // Arrange
    const extensions = [makeExtension({ identifier: "something-else" })];

    // Act + Assert
    expect(findOpenPopupExtension(extensions, target)).toBeUndefined();
  });
});
