import { type CataloguePredicateAPI } from "@dashboard/discounts/types";

import { type Condition, type ConditionType } from "../Condition";

export function prepareCatalogueRuleConditions(
  cataloguePredicate: CataloguePredicateAPI,
  ruleConditionsOptionsDetailsMap: Record<string, string>,
): Condition[] {
  const toOptions = createToOptionMap(ruleConditionsOptionsDetailsMap);

  if (Array.isArray(cataloguePredicate)) {
    return cataloguePredicate.flatMap(predicate =>
      prepareCatalogueRuleConditions(predicate, ruleConditionsOptionsDetailsMap),
    );
  }

  return Object.entries(cataloguePredicate)
    .flatMap(([key, value]) => {
      if (["OR", "AND"].includes(key)) {
        return prepareCatalogueRuleConditions(value, ruleConditionsOptionsDetailsMap);
      }

      if (!isIdsPredicate(value)) {
        return [];
      }

      return {
        id: key.split("Predicate")[0],
        type: "is" as ConditionType, // Catalog predicate always has only "is" condition type
        value: value.ids.map(toOptions),
      };
    })
    .filter(Boolean);
}

function isIdsPredicate(value: unknown): value is { ids: string[] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const ids = (value as { ids?: unknown }).ids;

  return Array.isArray(ids) && ids.every(id => typeof id === "string");
}

function createToOptionMap(ruleConditionsOptionsDetailsMap: Record<string, string>) {
  return (id: string) => ({
    label: ruleConditionsOptionsDetailsMap[id] || id,
    value: id,
  });
}
