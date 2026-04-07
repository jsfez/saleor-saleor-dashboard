import * as Sentry from "@sentry/react";
import { z } from "zod";

import { type CataloguePredicateAPI, type OrderPredicateAPI } from "../types";

const LOGICAL_OPERATOR_KEYS = ["AND", "OR"] as const;
const WHERE_OPERATION_KEYS = ["eq", "oneOf", "range"] as const;

const decimalValueSchema = z.union([z.string(), z.number()]);

const decimalRangeInputSchema = z
  .object({
    gte: decimalValueSchema.optional(),
    lte: decimalValueSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.gte === undefined && value.lte === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Decimal range must contain gte and/or lte.",
      });
    }
  });

const decimalFilterInputSchema = z
  .object({
    eq: decimalValueSchema.optional(),
    oneOf: z.array(decimalValueSchema).optional(),
    range: decimalRangeInputSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const operationCount =
      Number(value.eq !== undefined) +
      Number(value.oneOf !== undefined) +
      Number(value.range !== undefined);

    if (operationCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one filter operation can be used at a time.",
      });
    }
  });

function validateLogicalLevel(
  value: Record<string, unknown>,
  ctx: z.RefinementCtx,
  allowFlatFields: boolean,
) {
  const hasAnd = value.AND !== undefined;
  const hasOr = value.OR !== undefined;
  const hasAnyOperator = hasAnd || hasOr;
  const hasFlatFields = Object.keys(value).some(
    key => !LOGICAL_OPERATOR_KEYS.includes(key as (typeof LOGICAL_OPERATOR_KEYS)[number]),
  );

  if (hasAnd && hasOr) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only one logical operator can be used at each level.",
    });
  }

  if (!allowFlatFields && hasAnyOperator && hasFlatFields) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Logical operators cannot be mixed with flat fields at the same level.",
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateWhereValue(value: unknown, ctx: z.RefinementCtx, path: (string | number)[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateWhereValue(item, ctx, [...path, index]);
    });

    return;
  }

  if (!isObject(value)) {
    return;
  }

  const ids = value.ids;

  if (ids !== undefined && (!Array.isArray(ids) || !ids.every(id => typeof id === "string"))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The `ids` filter must be an array of string IDs.",
      path: [...path, "ids"],
    });
  }

  const operationCount = WHERE_OPERATION_KEYS.reduce((count, key) => {
    return count + Number(value[key] !== undefined);
  }, 0);

  if (operationCount > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only one filter operation can be used at a time.",
      path,
    });
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    validateWhereValue(nestedValue, ctx, [...path, key]);
  });
}

const discountedObjectPredicateSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      baseSubtotalPrice: decimalFilterInputSchema.optional(),
      baseTotalPrice: decimalFilterInputSchema.optional(),
      AND: z.array(discountedObjectPredicateSchema).optional(),
      OR: z.array(discountedObjectPredicateSchema).optional(),
    })
    .strict()
    .superRefine((value, ctx) => validateLogicalLevel(value, ctx, false)),
);

const orderPredicateSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      OR: z.array(orderPredicateSchema).optional(),
      AND: z.array(orderPredicateSchema).optional(),
      discountedObjectPredicate: discountedObjectPredicateSchema.optional(),
    })
    .strict()
    .superRefine((value, ctx) => validateLogicalLevel(value, ctx, false)),
);

const whereInputSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z
    .object({
      OR: z.array(whereInputSchema).optional(),
      AND: z.array(whereInputSchema).optional(),
    })
    .catchall(z.unknown())
    .superRefine((value, ctx) => {
      validateLogicalLevel(value, ctx, false);
      validateWhereValue(value, ctx);
    }),
);

const cataloguePredicateSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      OR: z.array(cataloguePredicateSchema).optional(),
      AND: z.array(cataloguePredicateSchema).optional(),
      productPredicate: whereInputSchema.optional(),
      categoryPredicate: whereInputSchema.optional(),
      collectionPredicate: whereInputSchema.optional(),
      variantPredicate: whereInputSchema.optional(),
    })
    .strict()
    .superRefine((value, ctx) => validateLogicalLevel(value, ctx, false)),
);

export function parseOrderPredicate(value: unknown): OrderPredicateAPI | null {
  const result = orderPredicateSchema.safeParse(value);

  if (!result.success) {
    Sentry.captureException(new Error("Failed to parse order predicate JSON"), {
      extra: { value, zodError: result.error.format() },
    });

    return null;
  }

  return result.data as OrderPredicateAPI;
}

export function parseCataloguePredicate(value: unknown): CataloguePredicateAPI | null {
  const result = cataloguePredicateSchema.safeParse(value);

  if (!result.success) {
    Sentry.captureException(new Error("Failed to parse catalogue predicate JSON"), {
      extra: { value, zodError: result.error.format() },
    });

    return null;
  }

  return result.data as CataloguePredicateAPI;
}
