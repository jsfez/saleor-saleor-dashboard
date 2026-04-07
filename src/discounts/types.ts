import { type DecimalFilterInput, type PromotionTypeEnum } from "@dashboard/graphql";
import { type useCategoryWithTotalProductsSearch } from "@dashboard/searches/useCategorySearch";
import { type useCollectionWithTotalProductsSearch } from "@dashboard/searches/useCollectionSearch";
import type useProductSearch from "@dashboard/searches/useProductSearch";

import { type Rule } from "./models";

export enum RequirementsPicker {
  ORDER = "ORDER",
  ITEM = "ITEM",
  NONE = "NONE",
}

export enum DiscountTypeEnum {
  VALUE_FIXED = "VALUE_FIXED",
  VALUE_PERCENTAGE = "VALUE_PERCENTAGE",
  SHIPPING = "SHIPPING",
}

export type SearchCategoriesOpts = ReturnType<typeof useCategoryWithTotalProductsSearch>["result"];
export type SearchCollectionOpts = ReturnType<
  typeof useCollectionWithTotalProductsSearch
>["result"];
export type SearchProductsOpts = ReturnType<typeof useProductSearch>["result"];

export interface DiscoutFormData {
  type: PromotionTypeEnum;
  name: string;
  description: string;
  dates: {
    endDate: string;
    endTime: string;
    hasEndDate: boolean;
    startDate: string;
    startTime: string;
  };
  rules: Rule[];
}

export type CatalogConditions = "product" | "category" | "collection" | "variant";

export type OrderConditions = "baseSubtotalPrice" | "baseTotalPrice";

// Mimic API catalogue predicate structure because api scheme type return any
export interface CataloguePredicateAPI {
  OR?: CataloguePredicateAPI[];
  AND?: CataloguePredicateAPI[];
  productPredicate?: Record<string, unknown>;
  categoryPredicate?: Record<string, unknown>;
  collectionPredicate?: Record<string, unknown>;
  variantPredicate?: Record<string, unknown>;
}

export interface OrderPredicateAPI {
  OR?: OrderPredicateAPI[];
  AND?: OrderPredicateAPI[];
  discountedObjectPredicate?: OrderDiscountedObjectPredicateAPI;
}

interface OrderDiscountedObjectPredicateAPI {
  baseSubtotalPrice?: DecimalFilterInput;
  baseTotalPrice?: DecimalFilterInput;
  AND?: Array<OrderDiscountedObjectPredicateAPI>;
  OR?: Array<OrderDiscountedObjectPredicateAPI>;
}
