import { z } from "zod";

import { normalizeLookupKey } from "@/lib/lookup-key";

const regionCodeSchema = z
  .string()
  .trim()
  .min(2, "Region code must contain at least 2 characters.")
  .max(16, "Region code must not exceed 16 characters.")
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => /^[A-Z0-9][A-Z0-9_-]*$/.test(value),
    "Region code may contain only A-Z, 0-9, underscore, or hyphen.",
  );

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required.")
  .max(120, "Display name must not exceed 120 characters.");

const aliasSchema = z
  .string()
  .trim()
  .min(1, "Alias is required.")
  .max(120, "Alias must not exceed 120 characters.");

export const createCalendarRegionSchema = z
  .object({
    code: regionCodeSchema,
    displayName: displayNameSchema,
    aliases: z.array(aliasSchema).max(50).optional().default([]),
  })
  .strict();

export const updateCalendarRegionSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.displayName !== undefined || value.isActive !== undefined,
    "At least one region field must be supplied.",
  );

export const createCalendarRegionAliasSchema = z
  .object({
    alias: aliasSchema,
  })
  .strict();

export const updateCalendarRegionAliasSchema = z
  .object({
    alias: aliasSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.alias !== undefined || value.isActive !== undefined,
    "At least one alias field must be supplied.",
  );

export type CreateCalendarRegionInput = z.infer<
  typeof createCalendarRegionSchema
>;
export type UpdateCalendarRegionInput = z.infer<
  typeof updateCalendarRegionSchema
>;
export type CreateCalendarRegionAliasInput = z.infer<
  typeof createCalendarRegionAliasSchema
>;
export type UpdateCalendarRegionAliasInput = z.infer<
  typeof updateCalendarRegionAliasSchema
>;

export type RegionAliasRecord = {
  normalizedAlias: string;
  isActive: boolean;
  region: {
    code: string;
    isActive: boolean;
  };
};

export function normalizeRegionAlias(value: string): string {
  return normalizeLookupKey(value);
}

export function initialRegionAliases(input: {
  code: string;
  displayName: string;
  aliases?: readonly string[];
}): Array<{ alias: string; normalizedAlias: string }> {
  const byKey = new Map<string, string>();
  for (const alias of [input.code, input.displayName, ...(input.aliases ?? [])]) {
    const normalizedAlias = normalizeRegionAlias(alias);
    if (normalizedAlias && !byKey.has(normalizedAlias)) {
      byKey.set(normalizedAlias, alias.trim());
    }
  }

  return [...byKey].map(([normalizedAlias, alias]) => ({
    alias,
    normalizedAlias,
  }));
}

export function isCanonicalRegionAlias(
  regionCode: string,
  normalizedAlias: string,
): boolean {
  return normalizeRegionAlias(regionCode) === normalizedAlias;
}

export function buildActiveRegionAliasMap(
  records: readonly RegionAliasRecord[],
): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const record of records) {
    if (!record.isActive || !record.region.isActive) {
      continue;
    }

    const existing = aliases.get(record.normalizedAlias);
    if (existing && existing !== record.region.code) {
      throw new Error(
        `Calendar-region invariant violated: alias "${record.normalizedAlias}" maps to both ${existing} and ${record.region.code}.`,
      );
    }

    aliases.set(record.normalizedAlias, record.region.code);
  }

  return aliases;
}
