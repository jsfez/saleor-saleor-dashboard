# Extension Visibility Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each staff user pin (sort-to-top) or hide (don't render) individual app widget-mount extensions, persisted per-user in their own metadata, managed both inline next to each widget and from a section on their own account page.

**Architecture:** Preferences are a sparse `Record<string, "pinned" | "hidden">` stored as JSON under a single public-metadata key on `me`. A stable key `(app.identifier ?? app.id):(extension.identifier ?? extension.id)` identifies each extension. A central `useExtensionPreferences()` hook reads the blob from the Apollo cache (via `useUser`) and writes it with an optimistic `accountUpdate` mutation. Enforcement (hide = don't render, pin = stable-sort to top) lives in the single shared `AppWidgets` render path; two surfaces mutate the same blob — hover icon-buttons next to each widget, and a tri-state list on the staff account page.

**Tech Stack:** React 17 + TypeScript, Apollo Client, `@saleor/macaw-ui-next`, `lucide-react`, `react-intl`, Jest + Testing Library, Storybook, GraphQL codegen (`pnpm run generate`).

## Global Constraints

- **Schema note (no longer a hard gate):** The feature ships today using the `?? id` fallback. `App.identifier` exists in the schema now and is used for the app half of the key. `AppExtension.identifier` does NOT exist yet, so the extension half falls back to `extension.id` until Core exposes it — a one-line change in `useExtensions` (`identifier: null` → node `identifier`) plus adding the field to the query. Preferences keyed on `extension.id` will reset when that upgrade lands; accepted tradeoff.
- **Metadata key:** exactly `dashboard-extensions-preferences` (public metadata on `me`).
- **Stored value shape:** `{ "<appIdentifier>:<extensionIdentifier>": "pinned" | "hidden" }`. Sparse — only non-default entries. Setting an extension back to default removes its entry from the map; an empty map is stored as the string `"{}"` (the `accountUpdate` mutation upserts by key and cannot delete the top-level key — an empty `{}` is harmless).
- **Scope whitelist:** only the 8 widget mounts (`WIDGET_AVAILABLE_MOUNTS`, re-exported as `PREFERENCE_ENABLED_MOUNTS`). All targets _within_ those mounts (WIDGET iframes + POPUP/NEW_TAB/APP_PAGE links) are controllable. `MORE_ACTIONS` / navigation / overview mounts are out of scope — no controls, no enforcement there.
- **No garbage collection:** orphaned entries for uninstalled apps are left in place (reinstall-stability is the point).
- **No default exports** for new components/functions. **Named exports only.** **No `// @ts-strict-ignore`** in new files. **No `as` type assertions** — use typed declarations. **CSS Modules** if any custom CSS is needed. Icons from `lucide-react`. UI from `@saleor/macaw-ui-next`.
- **Permission filtering:** the settings list shows only extensions the user could actually be shown, using `hasPermissions(userPermissions, extension.permissions)`.
- Run `pnpm run lint` (autofix) then `pnpm run check-types` before each commit. Tests via `pnpm run test:quiet <path>`.

---

## File Structure

New module: `src/extensions/preferences/`

- `constants.ts` — metadata key + `PREFERENCE_ENABLED_MOUNTS`.
- `types.ts` — `ExtensionPreferenceState`, `ResolvedPreferenceState`, `ExtensionPreferencesMap`, `PreferenceKeyInput`.
- `getExtensionPreferenceKey.ts` (+ `.test.ts`) — pure key resolver.
- `extensionPreferencesMetadata.ts` (+ `.test.ts`) — parse / serialize / setPreferenceInMap.
- `mutations.ts` — dedicated `UpdateExtensionPreferences` (`accountUpdate` selecting `user { id metadata }`).
- `useExtensionPreferences.ts` (+ `.test.tsx`) — read/write hook, optimistic.
- `applyExtensionPreferences.ts` (+ `.test.ts`) — hide-filter + stable pin-sort.
- `groupExtensionsByApp.ts` (+ `.test.ts`) — group + skip empty apps for settings list.
- `InlineExtensionPreferenceControls.tsx` (+ `.stories.tsx`) — hover pin/hide icon buttons.
- `ExtensionPreferenceStateControl.tsx` (+ `.stories.tsx`) — tri-state segmented control for the list.
- `ExtensionPreferencesSection.tsx` (+ `.stories.tsx`) — settings section (fetch + states + list).
- `messages.ts` — i18n for the module.

Modified:

- `src/extensions/queries.ts` — add `identifier` to `app` and to the extension node in `ExtensionList`.
- `src/extensions/hooks/useExtensions.ts` — map new `identifier` fields into `Extension`.
- `src/extensions/types.ts` — add `identifier` to `Extension` and its `app`.
- `src/extensions/components/AppWidgets/AppWidgets.tsx` — apply preferences (filter + pin-sort).
- `src/extensions/components/AppWidgets/AppWidgetExtensionItem.tsx` — render hover controls near label (both forms).
- `src/staff/components/StaffDetailsPage/StaffDetailsPage.tsx` — inject section gated on `canEditPreferences`.

---

## Task 1: Constants, types, and the preference-key resolver

**Files:**

- Create: `src/extensions/preferences/constants.ts`
- Create: `src/extensions/preferences/types.ts`
- Create: `src/extensions/preferences/getExtensionPreferenceKey.ts`
- Test: `src/extensions/preferences/getExtensionPreferenceKey.test.ts`

**Interfaces:**

- Produces:
  - `EXTENSION_PREFERENCES_METADATA_KEY: string`
  - `PREFERENCE_ENABLED_MOUNTS: readonly AllAppExtensionMounts[]`
  - `type ExtensionPreferenceState = "pinned" | "hidden"`
  - `type ResolvedPreferenceState = ExtensionPreferenceState | "default"`
  - `type ExtensionPreferencesMap = Record<string, ExtensionPreferenceState>`
  - `type PreferenceKeyInput = { id: string; identifier?: string | null; app: { id: string; identifier?: string | null } }`
  - `getExtensionPreferenceKey(extension: PreferenceKeyInput): string`

- [ ] **Step 1: Write the failing test**

```typescript
// src/extensions/preferences/getExtensionPreferenceKey.test.ts
import { getExtensionPreferenceKey } from "./getExtensionPreferenceKey";

describe("getExtensionPreferenceKey", () => {
  it("uses app.identifier and extension.identifier when both present", () => {
    // Arrange
    const extension = {
      id: "ext-id",
      identifier: "my.extension",
      app: { id: "app-id", identifier: "my.app" },
    };

    // Act
    const key = getExtensionPreferenceKey(extension);

    // Assert
    expect(key).toBe("my.app:my.extension");
  });

  it("falls back to app.id when app.identifier is null", () => {
    // Arrange
    const extension = {
      id: "ext-id",
      identifier: "my.extension",
      app: { id: "app-id", identifier: null },
    };

    // Act / Assert
    expect(getExtensionPreferenceKey(extension)).toBe("app-id:my.extension");
  });

  it("falls back to extension.id when extension.identifier is null", () => {
    // Arrange
    const extension = {
      id: "ext-id",
      identifier: null,
      app: { id: "app-id", identifier: "my.app" },
    };

    // Act / Assert
    expect(getExtensionPreferenceKey(extension)).toBe("my.app:ext-id");
  });

  it("falls back to both ids when identifier fields are missing", () => {
    // Arrange
    const extension = { id: "ext-id", app: { id: "app-id" } };

    // Act / Assert
    expect(getExtensionPreferenceKey(extension)).toBe("app-id:ext-id");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:quiet src/extensions/preferences/getExtensionPreferenceKey.test.ts`
Expected: FAIL — cannot find module `./getExtensionPreferenceKey`.

- [ ] **Step 3: Write constants, types, and the resolver**

```typescript
// src/extensions/preferences/constants.ts
import { WIDGET_AVAILABLE_MOUNTS } from "@dashboard/extensions/domain/app-extension-manifest-available-mounts";

export const EXTENSION_PREFERENCES_METADATA_KEY = "dashboard-extensions-preferences";

// Only the widget mounts are controllable in v1. Enforcement and the settings
// list are both driven off this whitelist so there are never dead toggles.
export const PREFERENCE_ENABLED_MOUNTS = WIDGET_AVAILABLE_MOUNTS;
```

```typescript
// src/extensions/preferences/types.ts
export type ExtensionPreferenceState = "pinned" | "hidden";

export type ResolvedPreferenceState = ExtensionPreferenceState | "default";

export type ExtensionPreferencesMap = Record<string, ExtensionPreferenceState>;

export interface PreferenceKeyInput {
  id: string;
  identifier?: string | null;
  app: {
    id: string;
    identifier?: string | null;
  };
}
```

```typescript
// src/extensions/preferences/getExtensionPreferenceKey.ts
import { type PreferenceKeyInput } from "./types";

export const getExtensionPreferenceKey = (extension: PreferenceKeyInput): string => {
  const appPart = extension.app.identifier ?? extension.app.id;
  const extensionPart = extension.identifier ?? extension.id;

  return `${appPart}:${extensionPart}`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:quiet src/extensions/preferences/getExtensionPreferenceKey.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint, type-check, commit**

```bash
pnpm run lint
pnpm run check-types
git add src/extensions/preferences/constants.ts src/extensions/preferences/types.ts src/extensions/preferences/getExtensionPreferenceKey.ts src/extensions/preferences/getExtensionPreferenceKey.test.ts
git commit -m "feat(extensions): add preference key resolver and constants"
```

---

## Task 2: Metadata parse / serialize / update helpers

**Files:**

- Create: `src/extensions/preferences/extensionPreferencesMetadata.ts`
- Test: `src/extensions/preferences/extensionPreferencesMetadata.test.ts`

**Interfaces:**

- Consumes: `ExtensionPreferencesMap`, `ResolvedPreferenceState` (Task 1).
- Produces:
  - `parseExtensionPreferences(rawValue: string | undefined | null): ExtensionPreferencesMap`
  - `serializeExtensionPreferences(map: ExtensionPreferencesMap): string`
  - `setPreferenceInMap(map: ExtensionPreferencesMap, key: string, next: ResolvedPreferenceState): ExtensionPreferencesMap`

- [ ] **Step 1: Write the failing test**

```typescript
// src/extensions/preferences/extensionPreferencesMetadata.test.ts
import {
  parseExtensionPreferences,
  serializeExtensionPreferences,
  setPreferenceInMap,
} from "./extensionPreferencesMetadata";
import { type ExtensionPreferencesMap } from "./types";

describe("parseExtensionPreferences", () => {
  it("returns an empty map for undefined / empty input", () => {
    expect(parseExtensionPreferences(undefined)).toEqual({});
    expect(parseExtensionPreferences("")).toEqual({});
    expect(parseExtensionPreferences("{}")).toEqual({});
  });

  it("returns an empty map for malformed JSON without throwing", () => {
    expect(parseExtensionPreferences("not json")).toEqual({});
  });

  it("parses valid entries and drops entries with invalid state values", () => {
    // Arrange
    const raw = JSON.stringify({ "a:1": "pinned", "b:2": "hidden", "c:3": "bogus" });

    // Act / Assert
    expect(parseExtensionPreferences(raw)).toEqual({ "a:1": "pinned", "b:2": "hidden" });
  });
});

describe("setPreferenceInMap", () => {
  it("adds a pinned entry", () => {
    expect(setPreferenceInMap({}, "a:1", "pinned")).toEqual({ "a:1": "pinned" });
  });

  it("overwrites an existing entry (mutually exclusive)", () => {
    const map: ExtensionPreferencesMap = { "a:1": "pinned" };
    expect(setPreferenceInMap(map, "a:1", "hidden")).toEqual({ "a:1": "hidden" });
  });

  it("deletes the entry when set to default", () => {
    const map: ExtensionPreferencesMap = { "a:1": "pinned", "b:2": "hidden" };
    expect(setPreferenceInMap(map, "a:1", "default")).toEqual({ "b:2": "hidden" });
  });

  it("does not mutate the input map", () => {
    // Arrange
    const map: ExtensionPreferencesMap = { "a:1": "pinned" };

    // Act
    setPreferenceInMap(map, "a:1", "hidden");

    // Assert
    expect(map).toEqual({ "a:1": "pinned" });
  });
});

describe("serializeExtensionPreferences", () => {
  it("serializes an empty map to '{}'", () => {
    expect(serializeExtensionPreferences({})).toBe("{}");
  });

  it("round-trips through parse", () => {
    const map: ExtensionPreferencesMap = { "a:1": "pinned" };
    expect(parseExtensionPreferences(serializeExtensionPreferences(map))).toEqual(map);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:quiet src/extensions/preferences/extensionPreferencesMetadata.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```typescript
// src/extensions/preferences/extensionPreferencesMetadata.ts
import {
  type ExtensionPreferenceState,
  type ExtensionPreferencesMap,
  type ResolvedPreferenceState,
} from "./types";

const isPreferenceState = (value: unknown): value is ExtensionPreferenceState =>
  value === "pinned" || value === "hidden";

export const parseExtensionPreferences = (
  rawValue: string | undefined | null,
): ExtensionPreferencesMap => {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);

    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const result: ExtensionPreferencesMap = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (isPreferenceState(value)) {
        result[key] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
};

export const serializeExtensionPreferences = (map: ExtensionPreferencesMap): string =>
  JSON.stringify(map);

export const setPreferenceInMap = (
  map: ExtensionPreferencesMap,
  key: string,
  next: ResolvedPreferenceState,
): ExtensionPreferencesMap => {
  const result: ExtensionPreferencesMap = { ...map };

  if (next === "default") {
    delete result[key];
  } else {
    result[key] = next;
  }

  return result;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:quiet src/extensions/preferences/extensionPreferencesMetadata.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, type-check, commit**

```bash
pnpm run lint && pnpm run check-types
git add src/extensions/preferences/extensionPreferencesMetadata.ts src/extensions/preferences/extensionPreferencesMetadata.test.ts
git commit -m "feat(extensions): add preference metadata parse/serialize helpers"
```

---

## Task 3: GraphQL — expose `identifier`, add dedicated mutation, regenerate

Requires the schema prerequisite from Global Constraints (`AppExtension.identifier` present). Regenerate types so `identifier` flows into `Extension`.

**Files:**

- Modify: `src/extensions/queries.ts:107-137` (ExtensionList query)
- Create: `src/extensions/preferences/mutations.ts`
- Modify: `src/extensions/hooks/useExtensions.ts:39-63` (map `identifier` into `Extension`)
- Modify: `src/extensions/types.ts:75-92` (add `identifier` to `Extension` + its `app`)
- Regenerated (do not hand-edit): `src/graphql/types.generated.ts`, `src/graphql/hooks.generated.ts`

**Interfaces:**

- Consumes: `EXTENSION_PREFERENCES_METADATA_KEY` is _not_ needed here.
- Produces:
  - `Extension.app.identifier: string | null` (from the query) and `Extension.identifier: string | null` (deferred, always `null` until Core)
  - Generated hook `useUpdateExtensionPreferencesMutation` returning `accountUpdate { user { id metadata { key value } } errors { ... } }`.

- [ ] **Step 1: Add `identifier` to the `app` selection of the ExtensionList query**

`App.identifier` exists in the schema today; `AppExtension.identifier` does NOT. So add `identifier` ONLY inside `app { ... }` (next to `id`). Do NOT add `identifier` to the extension node itself — that field is not in the schema and would break `pnpm run generate`. The extension half of the preference key falls back to `extension.id` until Core exposes `AppExtension.identifier` (a one-line change then).

```graphql
query ExtensionList($filter: AppExtensionFilterInput!) {
  appExtensions(filter: $filter, first: 100) {
    edges {
      node {
        id
        label
        url
        mountName
        targetName
        settings
        accessToken
        permissions {
          code
        }
        app {
          id
          identifier
          appUrl
          name
          brand {
            logo {
              default(size: 32, format: WEBP)
            }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Add the dedicated preferences mutation**

```typescript
// src/extensions/preferences/mutations.ts
import { gql } from "@apollo/client";

// A dedicated account update that selects `user { id metadata }` so Apollo
// normalizes the result back into the `me` User in the cache (the shared
// UserAccountUpdate mutation omits `id`, so it does not update `useUser`).
export const updateExtensionPreferences = gql`
  mutation UpdateExtensionPreferences($input: AccountInput!) {
    accountUpdate(input: $input) {
      user {
        id
        metadata {
          key
          value
        }
      }
      errors {
        field
        message
        code
      }
    }
  }
`;
```

- [ ] **Step 3: Regenerate GraphQL types and hooks**

Run: `pnpm run generate`
Expected: `src/graphql/*.generated.ts` updated; new `useUpdateExtensionPreferencesMutation` hook and an `identifier` field on the `ExtensionList` query's `app` type. No errors.

- [ ] **Step 4: Thread `identifier` into the `Extension` type**

In `src/extensions/types.ts`, add a top-level `identifier` to `Extension`. The `app` field already derives from the query, so `app.identifier` now flows automatically. The extension-level `identifier` is deferred (schema field not yet available) — type it and populate it with `null` for now:

```typescript
export interface Extension {
  id: string;
  // Deferred: always null until Core exposes AppExtension.identifier. The
  // preference key resolver falls back to `id` when this is null.
  identifier: string | null;
  app: RelayToFlat<NonNullable<ExtensionListQuery["appExtensions"]>>[0]["app"];
  accessToken: string;
  permissions: PermissionEnum[];
  label: string;
  mountName: AllAppExtensionMounts;
  url: string;
  open: () => void;
  targetName: AppExtensionManifestTarget;
  settings: RelayToFlat<NonNullable<ExtensionListQuery["appExtensions"]>>[0]["settings"];
  isSaleorOfficial: boolean;
}
```

In `src/extensions/hooks/useExtensions.ts`, set `identifier: null` in the mapped object (do NOT destructure `identifier` from the node — it does not exist on the query type yet). Add a `TODO` so the future upgrade is obvious:

```typescript
.map(({ id, accessToken, permissions, url, label, mountName, targetName, app, settings }) => {
  // ...existing body unchanged...
  return {
    id,
    // TODO: replace with node `identifier` once Core exposes AppExtension.identifier.
    identifier: null,
    app,
    // ...rest unchanged...
  };
});
```

- [ ] **Step 5: Type-check**

Run: `pnpm run check-types`
Expected: PASS — `Extension.identifier` and `Extension.app.identifier` resolve; `getExtensionPreferenceKey` accepts an `Extension` (app half uses `app.identifier ?? app.id`, extension half falls back to `id`).

- [ ] **Step 6: Commit**

```bash
pnpm run lint
git add src/extensions/queries.ts src/extensions/preferences/mutations.ts src/extensions/hooks/useExtensions.ts src/extensions/types.ts src/graphql/types.generated.ts src/graphql/hooks.generated.ts
git commit -m "feat(extensions): expose extension/app identifier and add preferences mutation"
```

---

## Task 4: `useExtensionPreferences` hook

Reads the blob from `useUser().user.metadata`, exposes `getState`/`setState`. `setState` derives the new blob from the freshest cache value, writes it optimistically, and keeps buttons disabled while in flight.

**Files:**

- Create: `src/extensions/preferences/useExtensionPreferences.ts`
- Test: `src/extensions/preferences/useExtensionPreferences.test.tsx`

**Interfaces:**

- Consumes: `getExtensionPreferenceKey` (T1), `parseExtensionPreferences` / `serializeExtensionPreferences` / `setPreferenceInMap` (T2), `EXTENSION_PREFERENCES_METADATA_KEY` (T1), `useUpdateExtensionPreferencesMutation` (T3), `useUser` (`@dashboard/auth/useUser`).
- Produces:
  - `useExtensionPreferences(): { getState: (extension: PreferenceKeyInput) => ResolvedPreferenceState; setState: (extension: PreferenceKeyInput, next: ResolvedPreferenceState) => void; isSaving: boolean }`

- [ ] **Step 1: Write the failing test**

```tsx
// src/extensions/preferences/useExtensionPreferences.test.tsx
import { act, renderHook } from "@testing-library/react-hooks";
import React from "react";

import { useExtensionPreferences } from "./useExtensionPreferences";

const mockMutate = jest.fn().mockResolvedValue({ data: {} });
let mockUser: { id: string; metadata: Array<{ key: string; value: string }> } | null = null;

jest.mock("@dashboard/auth/useUser", () => ({
  useUser: () => ({ user: mockUser }),
}));

jest.mock("@dashboard/graphql", () => ({
  useUpdateExtensionPreferencesMutation: () => [mockMutate, { loading: false }],
}));

const extension = { id: "ext", identifier: "e", app: { id: "app", identifier: "a" } };

describe("useExtensionPreferences", () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockUser = {
      id: "user-1",
      metadata: [
        { key: "dashboard-extensions-preferences", value: JSON.stringify({ "a:e": "pinned" }) },
      ],
    };
  });

  it("resolves state from user metadata", () => {
    // Act
    const { result } = renderHook(() => useExtensionPreferences());

    // Assert
    expect(result.current.getState(extension)).toBe("pinned");
  });

  it("returns 'default' when no entry exists", () => {
    // Arrange
    mockUser = { id: "user-1", metadata: [] };

    // Act
    const { result } = renderHook(() => useExtensionPreferences());

    // Assert
    expect(result.current.getState(extension)).toBe("default");
  });

  it("writes the updated blob via accountUpdate on setState", () => {
    // Act
    const { result } = renderHook(() => useExtensionPreferences());

    act(() => {
      result.current.setState(extension, "hidden");
    });

    // Assert
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: {
            metadata: [
              {
                key: "dashboard-extensions-preferences",
                value: JSON.stringify({ "a:e": "hidden" }),
              },
            ],
          },
        },
      }),
    );
  });

  it("removes the entry when set to default", () => {
    // Act
    const { result } = renderHook(() => useExtensionPreferences());

    act(() => {
      result.current.setState(extension, "default");
    });

    // Assert
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: { metadata: [{ key: "dashboard-extensions-preferences", value: "{}" }] },
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:quiet src/extensions/preferences/useExtensionPreferences.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the hook**

```typescript
// src/extensions/preferences/useExtensionPreferences.ts
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
```

Note: the optimistic `metadata` array only needs the changed key — Apollo merges the returned `MetadataItem[]` into the normalized `User:{id}` object, and the real server response (full metadata) reconciles it. Verify by hand in Task 6/9 that toggling updates instantly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:quiet src/extensions/preferences/useExtensionPreferences.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint, type-check, commit**

```bash
pnpm run lint && pnpm run check-types
git add src/extensions/preferences/useExtensionPreferences.ts src/extensions/preferences/useExtensionPreferences.test.tsx
git commit -m "feat(extensions): add useExtensionPreferences hook"
```

---

## Task 5: `applyExtensionPreferences` — hide-filter + stable pin-sort

Removes hidden extensions and floats pinned ones to the top while preserving the incoming relative order within each group (stable).

**Files:**

- Create: `src/extensions/preferences/applyExtensionPreferences.ts`
- Test: `src/extensions/preferences/applyExtensionPreferences.test.ts`

**Interfaces:**

- Consumes: `ResolvedPreferenceState` (T1), `PreferenceKeyInput` (T1).
- Produces:
  - `applyExtensionPreferences<T extends PreferenceKeyInput>(extensions: T[], getState: (extension: PreferenceKeyInput) => ResolvedPreferenceState): T[]`

- [ ] **Step 1: Write the failing test**

```typescript
// src/extensions/preferences/applyExtensionPreferences.test.ts
import { applyExtensionPreferences } from "./applyExtensionPreferences";
import { type ResolvedPreferenceState } from "./types";

const ext = (id: string) => ({ id, identifier: id, app: { id: "app", identifier: "app" } });

describe("applyExtensionPreferences", () => {
  it("removes hidden extensions", () => {
    // Arrange
    const list = [ext("a"), ext("b"), ext("c")];
    const state: Record<string, ResolvedPreferenceState> = { "app:b": "hidden" };
    const getState = (e: { id: string }) => state[`app:${e.id}`] ?? "default";

    // Act
    const result = applyExtensionPreferences(list, getState);

    // Assert
    expect(result.map(e => e.id)).toEqual(["a", "c"]);
  });

  it("floats pinned extensions to the top, preserving relative order (stable)", () => {
    // Arrange
    const list = [ext("a"), ext("b"), ext("c"), ext("d")];
    const state: Record<string, ResolvedPreferenceState> = { "app:c": "pinned", "app:a": "pinned" };
    const getState = (e: { id: string }) => state[`app:${e.id}`] ?? "default";

    // Act
    const result = applyExtensionPreferences(list, getState);

    // Assert: pinned block keeps input order [a, c], then rest [b, d]
    expect(result.map(e => e.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("removes hidden and pins in one pass", () => {
    // Arrange
    const list = [ext("a"), ext("b"), ext("c")];
    const state: Record<string, ResolvedPreferenceState> = { "app:c": "pinned", "app:b": "hidden" };
    const getState = (e: { id: string }) => state[`app:${e.id}`] ?? "default";

    // Act / Assert
    expect(applyExtensionPreferences(list, getState).map(e => e.id)).toEqual(["c", "a"]);
  });

  it("does not mutate the input array", () => {
    // Arrange
    const list = [ext("a"), ext("b")];

    // Act
    applyExtensionPreferences(list, () => "default");

    // Assert
    expect(list.map(e => e.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:quiet src/extensions/preferences/applyExtensionPreferences.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```typescript
// src/extensions/preferences/applyExtensionPreferences.ts
import { getExtensionPreferenceKey } from "./getExtensionPreferenceKey";
import { type PreferenceKeyInput, type ResolvedPreferenceState } from "./types";

export const applyExtensionPreferences = <T extends PreferenceKeyInput>(
  extensions: T[],
  getState: (extension: PreferenceKeyInput) => ResolvedPreferenceState,
): T[] => {
  const visible = extensions.filter(extension => getState(extension) !== "hidden");

  const pinned = visible.filter(extension => getState(extension) === "pinned");
  const rest = visible.filter(extension => getState(extension) !== "pinned");

  return [...pinned, ...rest];
};
```

Note: `getExtensionPreferenceKey` is imported to keep the module self-documenting even though `getState` computes the key internally; if lint flags it as unused, remove the import.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:quiet src/extensions/preferences/applyExtensionPreferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, type-check, commit**

```bash
pnpm run lint && pnpm run check-types
git add src/extensions/preferences/applyExtensionPreferences.ts src/extensions/preferences/applyExtensionPreferences.test.ts
git commit -m "feat(extensions): add applyExtensionPreferences (filter + pin sort)"
```

---

## Task 6: Enforce preferences in the shared `AppWidgets` render path

Apply hide-filter + pin-sort to the widget list so every surface (Home, all detail pages) honors preferences from one place.

**Files:**

- Modify: `src/extensions/components/AppWidgets/AppWidgets.tsx`

**Interfaces:**

- Consumes: `useExtensionPreferences` (T4), `applyExtensionPreferences` (T5).

- [ ] **Step 1: Write the failing test**

```tsx
// src/extensions/components/AppWidgets/AppWidgets.test.tsx
import { render, screen } from "@testing-library/react";
import React from "react";

import { AppWidgets } from "./AppWidgets";

const getState = jest.fn();

jest.mock("@dashboard/extensions/preferences/useExtensionPreferences", () => ({
  useExtensionPreferences: () => ({ getState, setState: jest.fn(), isSaving: false }),
}));

// Render the extension item as its label so we can assert order/visibility.
jest.mock("./AppWidgetExtensionItem", () => ({
  AppWidgetExtensionItem: ({ extension }: { extension: { label: string } }) => (
    <div>{extension.label}</div>
  ),
}));

const makeExt = (id: string, label: string) => ({
  id,
  identifier: id,
  label,
  targetName: "WIDGET",
  app: { id: "app", identifier: "app", name: "App", appUrl: "https://x" },
});

describe("AppWidgets preference enforcement", () => {
  beforeEach(() => getState.mockReset());

  it("hides extensions marked hidden", () => {
    // Arrange
    getState.mockImplementation((e: { id: string }) => (e.id === "b" ? "hidden" : "default"));
    const extensions = [makeExt("a", "Alpha"), makeExt("b", "Beta")];

    // Act
    render(<AppWidgets extensions={extensions as never} params={{} as never} />);

    // Assert
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:quiet src/extensions/components/AppWidgets/AppWidgets.test.tsx`
Expected: FAIL — `Beta` still rendered (no enforcement yet).

- [ ] **Step 3: Apply preferences in `AppWidgets`**

Replace the body of `src/extensions/components/AppWidgets/AppWidgets.tsx` so preferences are applied on top of the existing app-name/label base sort:

```tsx
import { type ExtensionWithParams } from "@dashboard/extensions/types";
import { type AppDetailsUrlMountQueryParams } from "@dashboard/extensions/urls";
import { type ThemeType } from "@saleor/app-sdk/app-bridge";
import { Box } from "@saleor/macaw-ui-next";
import { useRef } from "react";

import { applyExtensionPreferences } from "../../preferences/applyExtensionPreferences";
import { useExtensionPreferences } from "../../preferences/useExtensionPreferences";
import { AppWidgetExtensionItem } from "./AppWidgetExtensionItem";

type AppWidgetsProps = {
  extensions: ExtensionWithParams[];
  params: AppDetailsUrlMountQueryParams;
};

// Base ordering preserved from the previous behaviour: by app name, then label.
const sortExtensions = (extensions: ExtensionWithParams[]): ExtensionWithParams[] =>
  [...extensions].sort((a, b) => {
    const byApp = (a.app.name ?? "").localeCompare(b.app.name ?? "");

    if (byApp !== 0) {
      return byApp;
    }

    return a.label.localeCompare(b.label);
  });

export const AppWidgets = ({ extensions, params }: AppWidgetsProps) => {
  const themeRef = useRef<ThemeType>();
  const { getState } = useExtensionPreferences();

  // Base sort first, then filter hidden + float pinned to the top (stable).
  const sortedExtensions = applyExtensionPreferences(sortExtensions(extensions), getState);

  return (
    <Box display="flex" flexDirection="column" gap={6}>
      {sortedExtensions.map(extension => (
        <AppWidgetExtensionItem
          key={extension.id}
          extension={extension}
          params={params}
          theme={themeRef.current}
        />
      ))}
    </Box>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:quiet src/extensions/components/AppWidgets/AppWidgets.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint, type-check, commit**

```bash
pnpm run lint && pnpm run check-types
git add src/extensions/components/AppWidgets/AppWidgets.tsx src/extensions/components/AppWidgets/AppWidgets.test.tsx
git commit -m "feat(extensions): enforce visibility preferences in AppWidgets"
```

---

## Task 7: Inline hover pin/hide controls in the widgets area

Two hover-revealed icon buttons (Pin + EyeOff) near the label, in both the iframe form and the link form, with native `title` tooltips. Buttons disabled while a write is in flight.

**Files:**

- Create: `src/extensions/preferences/InlineExtensionPreferenceControls.tsx`
- Create: `src/extensions/preferences/InlineExtensionPreferenceControls.stories.tsx`
- Create: `src/extensions/preferences/messages.ts`
- Modify: `src/extensions/components/AppWidgets/AppWidgetExtensionItem.tsx`

**Interfaces:**

- Consumes: `useExtensionPreferences` (T4), `PreferenceKeyInput` (T1).
- Produces:
  - `InlineExtensionPreferenceControls({ extension }: { extension: PreferenceKeyInput & { label: string } })`

- [ ] **Step 1: Add module i18n messages**

```typescript
// src/extensions/preferences/messages.ts
import { defineMessages } from "react-intl";

export const extensionPreferencesMessages = defineMessages({
  pin: {
    id: "ext.pref.pin",
    defaultMessage: "Pin extension",
    description: "tooltip for pin action on a widget extension",
  },
  unpin: {
    id: "ext.pref.unpin",
    defaultMessage: "Unpin extension",
    description: "tooltip for unpin action",
  },
  hide: {
    id: "ext.pref.hide",
    defaultMessage: "Hide extension",
    description: "tooltip for hide action on a widget extension",
  },
  sectionTitle: {
    id: "ext.pref.sectionTitle",
    defaultMessage: "Extensions visibility",
    description: "account settings section title",
  },
  sectionSubtitle: {
    id: "ext.pref.sectionSubtitle",
    defaultMessage: "Pin extensions to the top or hide them across the dashboard.",
    description: "account settings section subtitle",
  },
  stateDefault: {
    id: "ext.pref.stateDefault",
    defaultMessage: "Default",
    description: "tri-state option: default visibility",
  },
  statePinned: {
    id: "ext.pref.statePinned",
    defaultMessage: "Pinned",
    description: "tri-state option: pinned",
  },
  stateHidden: {
    id: "ext.pref.stateHidden",
    defaultMessage: "Hidden",
    description: "tri-state option: hidden",
  },
  emptyState: {
    id: "ext.pref.emptyState",
    defaultMessage: "No extensions available to manage.",
    description: "empty state for extensions visibility list",
  },
  loadError: {
    id: "ext.pref.loadError",
    defaultMessage: "Couldn't load extensions.",
    description: "error state for extensions visibility list",
  },
});
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/extensions/preferences/InlineExtensionPreferenceControls.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { IntlProvider } from "react-intl";

import { InlineExtensionPreferenceControls } from "./InlineExtensionPreferenceControls";

const setState = jest.fn();
let currentState = "default";

jest.mock("./useExtensionPreferences", () => ({
  useExtensionPreferences: () => ({ getState: () => currentState, setState, isSaving: false }),
}));

const extension = { id: "e", identifier: "e", label: "Widget", app: { id: "a", identifier: "a" } };

const renderControls = () =>
  render(
    <IntlProvider locale="en" messages={{}}>
      <InlineExtensionPreferenceControls extension={extension} />
    </IntlProvider>,
  );

describe("InlineExtensionPreferenceControls", () => {
  beforeEach(() => {
    setState.mockClear();
    currentState = "default";
  });

  it("pins when the pin button is clicked", () => {
    // Arrange
    renderControls();

    // Act
    fireEvent.click(screen.getByTestId("extension-pin"));

    // Assert
    expect(setState).toHaveBeenCalledWith(extension, "pinned");
  });

  it("unpins when already pinned", () => {
    // Arrange
    currentState = "pinned";
    renderControls();

    // Act
    fireEvent.click(screen.getByTestId("extension-pin"));

    // Assert
    expect(setState).toHaveBeenCalledWith(extension, "default");
  });

  it("hides when the hide button is clicked", () => {
    // Arrange
    renderControls();

    // Act
    fireEvent.click(screen.getByTestId("extension-hide"));

    // Assert
    expect(setState).toHaveBeenCalledWith(extension, "hidden");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm run test:quiet src/extensions/preferences/InlineExtensionPreferenceControls.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Implement the controls**

```tsx
// src/extensions/preferences/InlineExtensionPreferenceControls.tsx
import { Box, Button } from "@saleor/macaw-ui-next";
import { EyeOff, Pin } from "lucide-react";
import { useIntl } from "react-intl";

import { extensionPreferencesMessages as m } from "./messages";
import { type PreferenceKeyInput } from "./types";
import { useExtensionPreferences } from "./useExtensionPreferences";

interface InlineExtensionPreferenceControlsProps {
  extension: PreferenceKeyInput & { label: string };
}

export const InlineExtensionPreferenceControls = ({
  extension,
}: InlineExtensionPreferenceControlsProps) => {
  const intl = useIntl();
  const { getState, setState, isSaving } = useExtensionPreferences();
  const state = getState(extension);
  const isPinned = state === "pinned";

  return (
    <Box display="flex" gap={1} alignItems="center">
      <Button
        type="button"
        variant="tertiary"
        size="small"
        disabled={isSaving}
        data-test-id="extension-pin"
        title={intl.formatMessage(isPinned ? m.unpin : m.pin)}
        onClick={() => setState(extension, isPinned ? "default" : "pinned")}
        icon={<Pin size={16} fill={isPinned ? "currentColor" : "none"} />}
      />
      <Button
        type="button"
        variant="tertiary"
        size="small"
        disabled={isSaving}
        data-test-id="extension-hide"
        title={intl.formatMessage(m.hide)}
        onClick={() => setState(extension, "hidden")}
        icon={<EyeOff size={16} />}
      />
    </Box>
  );
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm run test:quiet src/extensions/preferences/InlineExtensionPreferenceControls.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add a Storybook story**

```tsx
// src/extensions/preferences/InlineExtensionPreferenceControls.stories.tsx
import { type Meta, type StoryObj } from "@storybook/react";

import { InlineExtensionPreferenceControls } from "./InlineExtensionPreferenceControls";

const meta: Meta<typeof InlineExtensionPreferenceControls> = {
  title: "Extensions / InlineExtensionPreferenceControls",
  component: InlineExtensionPreferenceControls,
};

export default meta;

export const Default: StoryObj<typeof InlineExtensionPreferenceControls> = {
  args: {
    extension: { id: "e", identifier: "e", label: "My widget", app: { id: "a", identifier: "a" } },
  },
};
```

- [ ] **Step 7: Wire controls into `AppWidgetExtensionItem` (both forms, hover-revealed)**

Wrap both render branches in a hover container that reveals the controls next to the label. Edit `src/extensions/components/AppWidgets/AppWidgetExtensionItem.tsx`:

1. Add imports:

```tsx
import { InlineExtensionPreferenceControls } from "@dashboard/extensions/preferences/InlineExtensionPreferenceControls";
```

2. For the **link branch** (`extension.targetName !== "WIDGET"`), wrap each returned `<Link>` in a hover row. Replace the `switch` return values so each case renders inside a shared wrapper. Extract a local helper inside the component:

```tsx
const renderWithControls = (children: React.ReactNode) => (
  <Box
    display="flex"
    alignItems="center"
    justifyContent="space-between"
    gap={2}
    className={styles.hoverRow}
  >
    <Box>{children}</Box>
    <Box className={styles.hoverControls}>
      <InlineExtensionPreferenceControls extension={extension} />
    </Box>
  </Box>
);
```

Wrap each `switch` case return, e.g.:

```tsx
case "NEW_TAB":
  return renderWithControls(
    <Link onClick={onClick} title={intl.formatMessage(extensionActions.openInNewTab)}>
      {extension.label} <ExternalLink style={{ width: 16, height: 16, verticalAlign: "text-bottom" }} />
    </Link>,
  );
```

3. For the **iframe (WIDGET) branch**, pass the controls into the card header. The simplest non-invasive approach: render the controls as an overlay row above the `AppWidgetCard`:

```tsx
return (
  <Box className={styles.hoverRow}>
    <Box display="flex" justifyContent="flex-end" className={styles.hoverControls}>
      <InlineExtensionPreferenceControls extension={extension} />
    </Box>
    <AppWidgetCard extension={extension}>{/* unchanged iframe content */}</AppWidgetCard>
  </Box>
);
```

4. Add the CSS module `src/extensions/components/AppWidgets/AppWidgetExtensionItem.module.css`:

```css
.hoverRow .hoverControls {
  opacity: 0;
  transition: opacity 120ms ease;
}

.hoverRow:hover .hoverControls,
.hoverRow:focus-within .hoverControls {
  opacity: 1;
}
```

and import it: `import styles from "./AppWidgetExtensionItem.module.css";`

- [ ] **Step 8: Type-check, lint, run the widgets test**

Run: `pnpm run lint && pnpm run check-types`
Run: `pnpm run test:quiet src/extensions/components/AppWidgets/AppWidgets.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/extensions/preferences/InlineExtensionPreferenceControls.tsx src/extensions/preferences/InlineExtensionPreferenceControls.test.tsx src/extensions/preferences/InlineExtensionPreferenceControls.stories.tsx src/extensions/preferences/messages.ts src/extensions/components/AppWidgets/AppWidgetExtensionItem.tsx src/extensions/components/AppWidgets/AppWidgetExtensionItem.module.css
git commit -m "feat(extensions): add inline pin/hide controls to widgets"
```

---

## Task 8: Settings list — grouping util, tri-state control, and section

**Files:**

- Create: `src/extensions/preferences/groupExtensionsByApp.ts`
- Test: `src/extensions/preferences/groupExtensionsByApp.test.ts`
- Create: `src/extensions/preferences/ExtensionPreferenceStateControl.tsx`
- Test: `src/extensions/preferences/ExtensionPreferenceStateControl.test.tsx`
- Create: `src/extensions/preferences/ExtensionPreferenceStateControl.stories.tsx`
- Create: `src/extensions/preferences/ExtensionPreferencesSection.tsx`
- Create: `src/extensions/preferences/ExtensionPreferencesSection.stories.tsx`

**Interfaces:**

- Consumes: `useExtensions` (`@dashboard/extensions/hooks/useExtensions`), `PREFERENCE_ENABLED_MOUNTS` (T1), `useUserPermissions` (`@dashboard/auth/hooks/useUserPermissions`), `hasPermissions` (`@dashboard/components/RequirePermissions`), `useExtensionPreferences` (T4), `Extension` type.
- Produces:
  - `groupExtensionsByApp(extensions: Extension[]): Array<{ app: Extension["app"]; extensions: Extension[] }>`
  - `ExtensionPreferenceStateControl({ value, disabled, onChange })`
  - `ExtensionPreferencesSection()` — self-contained; renders nothing meaningful only when there are zero visible extensions (empty state).

- [ ] **Step 1: Write the failing test for grouping**

```typescript
// src/extensions/preferences/groupExtensionsByApp.test.ts
import { groupExtensionsByApp } from "./groupExtensionsByApp";

const ext = (id: string, appId: string, appName: string) => ({
  id,
  identifier: id,
  label: id,
  app: { id: appId, identifier: appId, name: appName },
});

describe("groupExtensionsByApp", () => {
  it("groups extensions by app id", () => {
    // Arrange
    const list = [
      ext("a", "app1", "App One"),
      ext("b", "app2", "App Two"),
      ext("c", "app1", "App One"),
    ];

    // Act
    const groups = groupExtensionsByApp(list as never);

    // Assert
    expect(groups).toHaveLength(2);
    expect(groups[0].app.id).toBe("app1");
    expect(groups[0].extensions.map(e => e.id)).toEqual(["a", "c"]);
  });

  it("returns an empty array for no extensions (skips empty apps by construction)", () => {
    expect(groupExtensionsByApp([])).toEqual([]);
  });

  it("sorts groups by app name", () => {
    // Arrange
    const list = [ext("a", "app2", "Zebra"), ext("b", "app1", "Alpha")];

    // Act
    const groups = groupExtensionsByApp(list as never);

    // Assert
    expect(groups.map(g => g.app.name)).toEqual(["Alpha", "Zebra"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement grouping**

Run: `pnpm run test:quiet src/extensions/preferences/groupExtensionsByApp.test.ts`
Expected: FAIL — cannot find module.

```typescript
// src/extensions/preferences/groupExtensionsByApp.ts
import { type Extension } from "@dashboard/extensions/types";

interface ExtensionAppGroup {
  app: Extension["app"];
  extensions: Extension[];
}

export const groupExtensionsByApp = (extensions: Extension[]): ExtensionAppGroup[] => {
  const groups = new Map<string, ExtensionAppGroup>();

  for (const extension of extensions) {
    const existing = groups.get(extension.app.id);

    if (existing) {
      existing.extensions.push(extension);
    } else {
      groups.set(extension.app.id, { app: extension.app, extensions: [extension] });
    }
  }

  return [...groups.values()].sort((a, b) => (a.app.name ?? "").localeCompare(b.app.name ?? ""));
};
```

Run again: Expected PASS.

- [ ] **Step 3: Write the failing test for the tri-state control**

```tsx
// src/extensions/preferences/ExtensionPreferenceStateControl.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { IntlProvider } from "react-intl";

import { ExtensionPreferenceStateControl } from "./ExtensionPreferenceStateControl";

const renderControl = (
  props: Partial<React.ComponentProps<typeof ExtensionPreferenceStateControl>> = {},
) =>
  render(
    <IntlProvider locale="en" messages={{}}>
      <ExtensionPreferenceStateControl
        value="default"
        disabled={false}
        onChange={jest.fn()}
        {...props}
      />
    </IntlProvider>,
  );

describe("ExtensionPreferenceStateControl", () => {
  it("calls onChange with the selected state", () => {
    // Arrange
    const onChange = jest.fn();
    renderControl({ onChange });

    // Act
    fireEvent.click(screen.getByTestId("extension-state-hidden"));

    // Assert
    expect(onChange).toHaveBeenCalledWith("hidden");
  });
});
```

- [ ] **Step 4: Run to verify it fails, then implement the control**

Run: `pnpm run test:quiet src/extensions/preferences/ExtensionPreferenceStateControl.test.tsx`
Expected: FAIL — cannot find module.

```tsx
// src/extensions/preferences/ExtensionPreferenceStateControl.tsx
import { Box, Button } from "@saleor/macaw-ui-next";
import { useIntl } from "react-intl";

import { extensionPreferencesMessages as m } from "./messages";
import { type ResolvedPreferenceState } from "./types";

interface ExtensionPreferenceStateControlProps {
  value: ResolvedPreferenceState;
  disabled: boolean;
  onChange: (next: ResolvedPreferenceState) => void;
}

const OPTIONS: ResolvedPreferenceState[] = ["default", "pinned", "hidden"];

export const ExtensionPreferenceStateControl = ({
  value,
  disabled,
  onChange,
}: ExtensionPreferenceStateControlProps) => {
  const intl = useIntl();

  const labels: Record<ResolvedPreferenceState, string> = {
    default: intl.formatMessage(m.stateDefault),
    pinned: intl.formatMessage(m.statePinned),
    hidden: intl.formatMessage(m.stateHidden),
  };

  return (
    <Box display="flex" gap={1}>
      {OPTIONS.map(option => (
        <Button
          key={option}
          type="button"
          size="small"
          disabled={disabled}
          variant={value === option ? "primary" : "secondary"}
          data-test-id={`extension-state-${option}`}
          onClick={() => onChange(option)}
        >
          {labels[option]}
        </Button>
      ))}
    </Box>
  );
};
```

Run again: Expected PASS.

- [ ] **Step 5: Add a story for the control**

```tsx
// src/extensions/preferences/ExtensionPreferenceStateControl.stories.tsx
import { type Meta, type StoryObj } from "@storybook/react";

import { ExtensionPreferenceStateControl } from "./ExtensionPreferenceStateControl";

const meta: Meta<typeof ExtensionPreferenceStateControl> = {
  title: "Extensions / ExtensionPreferenceStateControl",
  component: ExtensionPreferenceStateControl,
  args: { value: "default", disabled: false },
};

export default meta;

export const Default: StoryObj<typeof ExtensionPreferenceStateControl> = {};
```

- [ ] **Step 6: Implement the section (fetch + permission-filter + states + list)**

```tsx
// src/extensions/preferences/ExtensionPreferencesSection.tsx
import { useUserPermissions } from "@dashboard/auth/hooks/useUserPermissions";
import { DashboardCard } from "@dashboard/components/Card";
import { hasPermissions } from "@dashboard/components/RequirePermissions";
import { useExtensions } from "@dashboard/extensions/hooks/useExtensions";
import { type Extension } from "@dashboard/extensions/types";
import { Box, Text } from "@saleor/macaw-ui-next";
import { useMemo } from "react";
import { useIntl } from "react-intl";

import { PREFERENCE_ENABLED_MOUNTS } from "./constants";
import { ExtensionPreferenceStateControl } from "./ExtensionPreferenceStateControl";
import { groupExtensionsByApp } from "./groupExtensionsByApp";
import { extensionPreferencesMessages as m } from "./messages";
import { useExtensionPreferences } from "./useExtensionPreferences";

export const ExtensionPreferencesSection = () => {
  const intl = useIntl();
  const userPermissions = useUserPermissions();
  const extensionsByMount = useExtensions(PREFERENCE_ENABLED_MOUNTS);
  const { getState, setState, isSaving } = useExtensionPreferences();

  const groups = useMemo(() => {
    const all: Extension[] = Object.values(extensionsByMount).flat();
    const visible = all.filter(extension =>
      hasPermissions(userPermissions ?? [], extension.permissions),
    );

    return groupExtensionsByApp(visible);
  }, [extensionsByMount, userPermissions]);

  return (
    <DashboardCard>
      <DashboardCard.Header>
        <DashboardCard.Title>{intl.formatMessage(m.sectionTitle)}</DashboardCard.Title>
      </DashboardCard.Header>
      <DashboardCard.Content>
        <Text as="p" color="default2" marginBottom={4}>
          {intl.formatMessage(m.sectionSubtitle)}
        </Text>

        {groups.length === 0 ? (
          <Text color="default2">{intl.formatMessage(m.emptyState)}</Text>
        ) : (
          <Box display="flex" flexDirection="column" gap={6}>
            {groups.map(group => (
              <Box key={group.app.id} display="flex" flexDirection="column" gap={2}>
                <Text fontWeight="bold">{group.app.name}</Text>
                {group.extensions.map(extension => (
                  <Box
                    key={extension.id}
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    gap={4}
                  >
                    <Box display="flex" flexDirection="column">
                      <Text>{extension.label}</Text>
                      <Text size={2} color="default2">
                        {extension.mountName}
                      </Text>
                    </Box>
                    <ExtensionPreferenceStateControl
                      value={getState(extension)}
                      disabled={isSaving}
                      onChange={next => setState(extension, next)}
                    />
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </DashboardCard.Content>
    </DashboardCard>
  );
};
```

Note on the mount label (`extension.mountName`): shown raw here per the "show location" decision. If a human-readable label map is desired later, add one in `messages.ts` — not required for v1.

- [ ] **Step 7: Add a story for the section**

```tsx
// src/extensions/preferences/ExtensionPreferencesSection.stories.tsx
import { type Meta, type StoryObj } from "@storybook/react";

import { ExtensionPreferencesSection } from "./ExtensionPreferencesSection";

const meta: Meta<typeof ExtensionPreferencesSection> = {
  title: "Extensions / ExtensionPreferencesSection",
  component: ExtensionPreferencesSection,
};

export default meta;

// Relies on Apollo + auth context via the global Storybook decorators.
export const Default: StoryObj<typeof ExtensionPreferencesSection> = {};
```

- [ ] **Step 8: Lint, type-check, run tests, commit**

```bash
pnpm run lint && pnpm run check-types
pnpm run test:quiet src/extensions/preferences/groupExtensionsByApp.test.ts
pnpm run test:quiet src/extensions/preferences/ExtensionPreferenceStateControl.test.tsx
git add src/extensions/preferences/groupExtensionsByApp.ts src/extensions/preferences/groupExtensionsByApp.test.ts src/extensions/preferences/ExtensionPreferenceStateControl.tsx src/extensions/preferences/ExtensionPreferenceStateControl.test.tsx src/extensions/preferences/ExtensionPreferenceStateControl.stories.tsx src/extensions/preferences/ExtensionPreferencesSection.tsx src/extensions/preferences/ExtensionPreferencesSection.stories.tsx
git commit -m "feat(extensions): add extensions visibility settings section"
```

---

## Task 9: Inject the section into the staff account page (self only)

Render `ExtensionPreferencesSection` on the user's own staff detail page, gated on `canEditPreferences` (which is `isUserSameAsViewer`).

**Files:**

- Modify: `src/staff/components/StaffDetailsPage/StaffDetailsPage.tsx`

**Interfaces:**

- Consumes: `ExtensionPreferencesSection` (T8).

- [ ] **Step 1: Add the import and render the section in the Content column**

In `src/staff/components/StaffDetailsPage/StaffDetailsPage.tsx`, add the import:

```tsx
import { ExtensionPreferencesSection } from "@dashboard/extensions/preferences/ExtensionPreferencesSection";
import CardSpacer from "@dashboard/components/CardSpacer";
```

(`CardSpacer` is already imported — do not duplicate.)

Inside `<DetailPageLayout.Content>`, after `<StaffProperties ... />`, add:

```tsx
{
  canEditPreferences && (
    <>
      <CardSpacer />
      <ExtensionPreferencesSection />
    </>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `pnpm run lint && pnpm run check-types`
Expected: PASS.

- [ ] **Step 3: Manual verification (dev server)**

Start dev server in the background (per CLAUDE.md, always background): `pnpm run dev`

- Log in, open your own account page (user menu → your name), confirm the "Extensions visibility" section renders with your installed widget apps grouped by app.
- Toggle an extension to "Hidden", open a page hosting that widget (e.g. an order detail), confirm it disappears immediately.
- Toggle to "Pinned", confirm it floats to the top of the widgets column.
- Use the inline hover buttons on a widget: pin/hide, confirm the section reflects the change and vice-versa (shared blob, reactive).
- Confirm the section does NOT render when viewing another staff member's page (needs `MANAGE_STAFF`).

- [ ] **Step 4: Commit**

```bash
git add src/staff/components/StaffDetailsPage/StaffDetailsPage.tsx
git commit -m "feat(staff): add extensions visibility section to account page"
```

---

## Task 10: Extract messages and add a changeset

**Files:**

- Modify: generated locale file via `pnpm run extract-messages`
- Create: `.changeset/<name>.md`

- [ ] **Step 1: Extract i18n messages**

Run: `pnpm run extract-messages`
Expected: `locale/defaultMessages.json` updated with the new `ext.pref.*` ids.

- [ ] **Step 2: Add a changeset**

```markdown
---
"saleor-dashboard": minor
---

Staff users can now pin or hide individual app widget extensions. Manage visibility inline via hover controls next to each widget, or from the new "Extensions visibility" section on your account page. Preferences are stored per-user and pinned widgets are sorted to the top while hidden ones are not rendered.
```

Save as `.changeset/extension-visibility-preferences.md`.

- [ ] **Step 3: Final full checks**

Run: `pnpm run lint`
Run: `pnpm run check-types`
Run: `pnpm run test:quiet src/extensions/preferences`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add locale/defaultMessages.json .changeset/extension-visibility-preferences.md
git commit -m "chore(extensions): extract messages and add changeset"
```

---

## Self-Review Notes (for the implementer)

- **Schema:** Task 3 adds `identifier` only to the query's `app` selection (that field exists). Do NOT add `identifier` to the extension node — it isn't in the schema and breaks `pnpm run generate`. `Extension.identifier` stays `null` until Core, and the resolver falls back to `extension.id`. If `generate` fails, check that no `identifier` was added to the extension node.
- **Reactivity depends on `id` in the mutation selection** (Task 3, Task 4). If toggles don't update `useUser` live, verify the `UpdateExtensionPreferences` mutation selects `user { id metadata }` and that Apollo cache normalization is on for `User`.
- **`accountUpdate` cannot delete a metadata key** — the empty-map case stores `"{}"`. This is intentional (see Global Constraints).
- **Permission parity:** the settings list uses `hasPermissions` exactly as `filterHomeExtensions` does, so it mirrors what actually renders.
- **Scope:** only `PREFERENCE_ENABLED_MOUNTS` (the 8 widget mounts) are listed and enforced. Do not add controls to `MORE_ACTIONS`/nav mounts.

```

```
