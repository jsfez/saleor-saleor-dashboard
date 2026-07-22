import { defineMessages } from "react-intl";

export const webhookManifestMessages = defineMessages({
  refreshButton: {
    defaultMessage: "Refresh webhooks",
    id: "QCQK3o",
  },
  checkingManifest: {
    defaultMessage: "Checking the extension manifest…",
    id: "nLMe/p",
  },
  mismatch: {
    defaultMessage:
      "{count, plural, one {Webhooks differ from the manifest in one place.} other {Webhooks differ from the manifest in # places.}}",
    id: "hnhB4/",
  },
  unavailable: {
    defaultMessage:
      "Dashboard couldn't read this extension's manifest. Refresh requires the manifest to allow browser access.",
    id: "lqxnnt",
  },
  invalidManifest: {
    defaultMessage: "The extension manifest doesn't contain valid webhook definitions.",
    id: "pXShHA",
  },
  identifierMismatch: {
    defaultMessage: "The manifest identifier doesn't match this installed extension.",
    id: "cFxfaO",
  },
  missingPermissions: {
    defaultMessage:
      "Update the extension permissions before refreshing its webhooks. Missing: {permissions}",
    id: "b2T+bU",
  },
  duplicateNames: {
    defaultMessage:
      "Webhook names must be unique before Dashboard can refresh them safely. Duplicates: {names}",
    id: "Ta4gMj",
  },
  alreadyCurrent: {
    defaultMessage: "Extension webhooks already match the manifest.",
    id: "q72EeK",
  },
  refreshSucceeded: {
    defaultMessage: "Extension webhooks refreshed.",
    id: "jmlQB3",
  },
  refreshFailed: {
    defaultMessage:
      "Webhook refresh stopped. Some changes may already have been applied. Review the mismatch and try again.",
    id: "vf+BJF",
  },
  dialogTitle: {
    defaultMessage: "Refresh extension webhooks?",
    id: "3io9BC",
  },
  dialogDescription: {
    defaultMessage:
      "Dashboard will apply these changes one at a time. If a request fails, earlier changes won't be rolled back.",
    id: "U6VitM",
  },
  create: {
    defaultMessage: "Create ({count})",
    id: "GqEjgQ",
  },
  update: {
    defaultMessage: "Update ({count})",
    id: "Q8bEXE",
  },
  deactivate: {
    defaultMessage: "Deactivate ({count})",
    id: "K95yte",
  },
  deactivateWarningTitle: {
    defaultMessage: "Obsolete webhooks will stop receiving events",
    id: "4bL3w3",
  },
  deactivateWarningDescription: {
    defaultMessage:
      "They will be disabled only. Dashboard won't delete their configuration or delivery history.",
    id: "VAq18O",
  },
  confirmRefresh: {
    defaultMessage: "Refresh webhooks",
    id: "QCQK3o",
  },
});
