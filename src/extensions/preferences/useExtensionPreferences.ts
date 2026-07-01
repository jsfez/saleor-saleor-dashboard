import { useUser } from "@dashboard/auth/useUser";
import { type MetadataInput, useUpdateExtensionPreferencesMutation } from "@dashboard/graphql";
import { useCallback, useMemo } from "react";

import { EXTENSION_PREFERENCES_METADATA_KEY } from "./constants";
import {
  parseExtensionPreferences,
  serializeExtensionPreferences,
  setPreferenceInMap,
} from "./extensionPreferencesMetadata";
import { getExtensionPreferenceKey } from "./getExtensionPreferenceKey";
import { type PreferenceKeyInput, type ResolvedPreferenceState } from "./types";

interface UseExtensionPreferences {
  getState: (extension: PreferenceKeyInput) => ResolvedPreferenceState;
  setState: (extension: PreferenceKeyInput, next: ResolvedPreferenceState) => void;
  isSaving: boolean;
}

export const useExtensionPreferences = (): UseExtensionPreferences => {
  const { user } = useUser();
  const [updatePreferences, { loading }] = useUpdateExtensionPreferencesMutation();

  const preferences = useMemo(() => {
    const rawValue = user?.metadata.find(m => m.key === EXTENSION_PREFERENCES_METADATA_KEY)?.value;

    return parseExtensionPreferences(rawValue);
  }, [user]);

  const getState = useCallback(
    (extension: PreferenceKeyInput): ResolvedPreferenceState => {
      const key = getExtensionPreferenceKey(extension);

      return preferences[key] ?? "default";
    },
    [preferences],
  );

  const setState = useCallback(
    (extension: PreferenceKeyInput, next: ResolvedPreferenceState) => {
      const userId = user?.id;

      if (!userId) {
        return;
      }

      const key = getExtensionPreferenceKey(extension);
      const nextMap = setPreferenceInMap(preferences, key, next);
      const nextValue = serializeExtensionPreferences(nextMap);
      const metadataInput: MetadataInput = {
        key: EXTENSION_PREFERENCES_METADATA_KEY,
        value: nextValue,
      };

      updatePreferences({
        variables: { input: { metadata: [metadataInput] } },
        optimisticResponse: {
          accountUpdate: {
            __typename: "AccountUpdate",
            errors: [],
            user: {
              __typename: "User",
              id: userId,
              metadata: [{ __typename: "MetadataItem", key: metadataInput.key, value: nextValue }],
            },
          },
        },
      });
    },
    [preferences, updatePreferences, user],
  );

  return { getState, setState, isSaving: loading };
};
