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
    /**
     * Payload the app already serialized (base64). The Dashboard forwards it
     * verbatim into the popup iframe URL; the receiving app decodes it back.
     */
    appParams?: string;
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
 * read the optional `reason` directly after checking `ok`.
 */
export interface ValidateOpenPopupParamsResult {
  ok: boolean;
  /** Failure description, set when `ok` is false. */
  reason?: string;
}

/**
 * Validate the app-supplied `appParams` before it goes into the popup URL. The
 * app already serialized it (base64) - the Dashboard doesn't decode it, only
 * guards its length so a malformed/huge value can't blow past the URL ceiling.
 */
export const validateOpenPopupParams = (appParams?: string): ValidateOpenPopupParamsResult => {
  if (appParams === undefined) {
    return { ok: true };
  }

  if (typeof appParams !== "string") {
    return { ok: false, reason: "appParams must be a string" };
  }

  if (appParams.length > OPEN_POPUP_MAX_PARAMS_LENGTH) {
    return {
      ok: false,
      reason: `appParams too large: ${appParams.length} chars (max ${OPEN_POPUP_MAX_PARAMS_LENGTH})`,
    };
  }

  return { ok: true };
};

/**
 * The subset of an extension needed to resolve and open a popup. Both
 * `Extension` and `ExtensionWithParams` satisfy it (the latter isn't assignable
 * to `Extension` because of its `open` signature).
 */
export type PopupCandidate = Pick<
  Extension,
  "id" | "app" | "identifier" | "targetName" | "url" | "label" | "accessToken" | "refetch"
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
