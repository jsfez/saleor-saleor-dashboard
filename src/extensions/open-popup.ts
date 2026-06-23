import { type Extension } from "./types";

/**
 * `openPopup` App Bridge action.
 *
 * Sent by a WIDGET-type extension to ask the Dashboard to open one of the SAME
 * app's POPUP extensions ("full mode"). Not yet part of `@saleor/app-sdk`'s
 * `Actions` union, so it's declared locally until the SDK ships it.
 */
export interface OpenPopupAction {
  type: "openPopup";
  payload: {
    actionId: string;
    /** App-defined, per-app-unique identifier of the target POPUP extension. */
    extensionIdentifier: string;
    /** Arbitrary JSON payload, serialized into the popup iframe URL. */
    params?: unknown;
  };
}

export const isOpenPopupAction = (data: unknown): data is OpenPopupAction => {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const action = data as Partial<OpenPopupAction>;

  return (
    action.type === "openPopup" &&
    typeof action.payload?.actionId === "string" &&
    typeof action.payload?.extensionIdentifier === "string"
  );
};

/**
 * Upper bound on the serialized payload length (chars). Keeps the resulting
 * iframe `src` well under the ~8 KB browser URL ceiling, leaving room for the
 * Dashboard context params (saleorApiUrl, theme, mount ids, ...).
 */
export const OPEN_POPUP_MAX_PARAMS_LENGTH = 2048;

/**
 * Not a discriminated union on purpose: these helpers are consumed from
 * non-strict files where boolean-literal discriminants don't narrow, so callers
 * read the optional `value`/`reason` directly after checking `ok`.
 */
export interface SerializeOpenPopupParamsResult {
  ok: boolean;
  /** Serialized payload to append to the URL; undefined when there's nothing. */
  value?: string;
  /** Failure description, set when `ok` is false. */
  reason?: string;
}

/**
 * Serialize the action's arbitrary `params` into a single string to be appended
 * to the popup URL. Returns `value: undefined` when there's nothing to append.
 */
export const serializeOpenPopupParams = (params: unknown): SerializeOpenPopupParamsResult => {
  if (params === undefined || params === null) {
    return { ok: true, value: undefined };
  }

  let serialized: string;

  try {
    serialized = JSON.stringify(params);
  } catch {
    return { ok: false, reason: "params is not JSON-serializable" };
  }

  // JSON.stringify returns undefined for values like functions/symbols, which
  // cannot reach us via postMessage, but guard anyway.
  if (serialized === undefined) {
    return { ok: false, reason: "params is not JSON-serializable" };
  }

  if (serialized.length > OPEN_POPUP_MAX_PARAMS_LENGTH) {
    return {
      ok: false,
      reason: `params too large: ${serialized.length} chars (max ${OPEN_POPUP_MAX_PARAMS_LENGTH})`,
    };
  }

  return { ok: true, value: serialized };
};

/**
 * The subset of an extension needed to resolve and open a popup. Both
 * `Extension` and `ExtensionWithParams` satisfy it (the latter isn't assignable
 * to `Extension` because of its `open` signature).
 */
export type PopupCandidate = Pick<
  Extension,
  "id" | "app" | "identifier" | "targetName" | "url" | "label" | "accessToken"
>;

/**
 * Find the POPUP extension a widget is allowed to open: same app
 * (`requestingAppId`), matching `identifier`, and `target === "POPUP"`.
 *
 * Filtering by app id is what enforces the "same app only" rule - candidates
 * from other apps are never considered.
 */
export const findOpenPopupExtension = (
  extensions: PopupCandidate[],
  {
    requestingAppId,
    extensionIdentifier,
  }: { requestingAppId: string; extensionIdentifier: string },
): PopupCandidate | undefined =>
  extensions.find(
    extension =>
      extension.app.id === requestingAppId &&
      extension.identifier === extensionIdentifier &&
      extension.targetName === "POPUP",
  );
