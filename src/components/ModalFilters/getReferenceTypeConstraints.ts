import { type InitialPageConstraints } from "./entityConfigs/ModalPageFilterProvider";
import { type InitialConstraints } from "./entityConfigs/ModalProductFilterProvider";

type ReferenceTypeOption =
  | { __typename?: "ProductType"; id: string; name: string }
  | { __typename?: "PageType"; id: string; name: string };

/**
 * Builds modal filter constraints from a reference attribute's `referenceTypes`.
 *
 * Reference attributes can restrict the referenceable objects to specific product
 * types and/or model (page) types. This maps that restriction into the constraint
 * shape consumed by the assign-reference modals so the type filter is pre-set.
 *
 * Returns `undefined` when there is no restriction to apply.
 */
export const getReferenceTypeConstraints = (
  referenceTypes: ReadonlyArray<ReferenceTypeOption | null> | null | undefined,
): (InitialConstraints & InitialPageConstraints) | undefined => {
  if (!referenceTypes?.length) {
    return undefined;
  }

  const productTypeRefs = referenceTypes.filter(
    (t): t is { __typename?: "ProductType"; id: string; name: string } =>
      t?.__typename === "ProductType" && Boolean(t?.id),
  );

  const pageTypeRefs = referenceTypes.filter(
    (t): t is { __typename?: "PageType"; id: string; name: string } =>
      t?.__typename === "PageType" && Boolean(t?.id),
  );

  if (productTypeRefs.length === 0 && pageTypeRefs.length === 0) {
    return undefined;
  }

  return {
    ...(productTypeRefs.length > 0 && {
      productTypes: productTypeRefs.map(t => ({ id: t.id, name: t.name })),
    }),
    ...(pageTypeRefs.length > 0 && {
      pageTypes: pageTypeRefs.map(t => ({ id: t.id, name: t.name })),
    }),
  };
};
