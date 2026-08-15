import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  buildActiveRegionAliasMap,
  createCalendarRegionAliasSchema,
  createCalendarRegionSchema,
  initialRegionAliases,
  isCanonicalRegionAlias,
  normalizeRegionAlias,
  updateCalendarRegionAliasSchema,
  updateCalendarRegionSchema,
} from "@/holiday/region-rules";
import { db } from "@/lib/db";

export class RegionRegistryError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "REGION_NOT_FOUND"
      | "ALIAS_NOT_FOUND"
      | "REGION_CONFLICT"
      | "ALIAS_CONFLICT"
      | "CANONICAL_ALIAS_REQUIRED",
    message: string,
    public readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "RegionRegistryError";
  }
}

const regionInclude = {
  aliases: {
    orderBy: [{ isActive: "desc" as const }, { normalizedAlias: "asc" as const }],
  },
} satisfies Prisma.CalendarRegionInclude;

export async function listCalendarRegions() {
  return db.calendarRegion.findMany({
    include: regionInclude,
    orderBy: { code: "asc" },
  });
}

export async function loadActiveRegionAliases(): Promise<Map<string, string>> {
  const aliases = await db.calendarRegionAlias.findMany({
    where: {
      isActive: true,
      region: { isActive: true },
    },
    select: {
      normalizedAlias: true,
      isActive: true,
      region: {
        select: {
          code: true,
          isActive: true,
        },
      },
    },
  });

  return buildActiveRegionAliasMap(aliases);
}

export async function createCalendarRegion(
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(createCalendarRegionSchema, input);
  const aliases = initialRegionAliases(parsed);

  try {
    return await db.$transaction(async (tx) => {
      const region = await tx.calendarRegion.create({
        data: {
          code: parsed.code,
          displayName: parsed.displayName,
          aliases: {
            create: aliases,
          },
        },
        include: regionInclude,
      });

      await tx.auditEvent.create({
        data: {
          userId: actorId,
          action: "CALENDAR_REGION_CREATED",
          entityType: "CalendarRegion",
          entityId: region.id,
          metadata: {
            after: regionSnapshot(region),
          },
        },
      });

      return region;
    });
  } catch (error) {
    throw mapPrismaConflict(error, "region");
  }
}

export async function updateCalendarRegion(
  regionId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(updateCalendarRegionSchema, input);

  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.calendarRegion.findUnique({
        where: { id: regionId },
        include: regionInclude,
      });
      if (!before) {
        throw new RegionRegistryError(
          "REGION_NOT_FOUND",
          "Calendar region was not found.",
          404,
        );
      }

      if (parsed.isActive === true) {
        const canonicalKey = normalizeRegionAlias(before.code);
        const canonicalAlias = before.aliases.find(
          (alias) => alias.normalizedAlias === canonicalKey,
        );

        if (canonicalAlias) {
          if (!canonicalAlias.isActive || canonicalAlias.alias !== before.code) {
            await tx.calendarRegionAlias.update({
              where: { id: canonicalAlias.id },
              data: {
                alias: before.code,
                normalizedAlias: canonicalKey,
                isActive: true,
              },
            });
          }
        } else {
          await tx.calendarRegionAlias.create({
            data: {
              regionId: before.id,
              alias: before.code,
              normalizedAlias: canonicalKey,
              isActive: true,
            },
          });
        }
      }

      const region = await tx.calendarRegion.update({
        where: { id: regionId },
        data: {
          ...(parsed.displayName !== undefined
            ? { displayName: parsed.displayName }
            : {}),
          ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
        },
        include: regionInclude,
      });

      await tx.auditEvent.create({
        data: {
          userId: actorId,
          action: regionAction(before.isActive, region.isActive),
          entityType: "CalendarRegion",
          entityId: region.id,
          metadata: {
            before: regionSnapshot(before),
            after: regionSnapshot(region),
          },
        },
      });

      return region;
    });
  } catch (error) {
    if (error instanceof RegionRegistryError) {
      throw error;
    }
    throw mapPrismaConflict(error, "region");
  }
}

export async function createCalendarRegionAlias(
  regionId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(createCalendarRegionAliasSchema, input);
  const normalizedAlias = normalizeRegionAlias(parsed.alias);

  try {
    return await db.$transaction(async (tx) => {
      const region = await tx.calendarRegion.findUnique({
        where: { id: regionId },
      });
      if (!region) {
        throw new RegionRegistryError(
          "REGION_NOT_FOUND",
          "Calendar region was not found.",
          404,
        );
      }

      const alias = await tx.calendarRegionAlias.create({
        data: {
          regionId,
          alias: parsed.alias,
          normalizedAlias,
        },
        include: {
          region: {
            select: {
              code: true,
              displayName: true,
              isActive: true,
            },
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          userId: actorId,
          action: "CALENDAR_REGION_ALIAS_CREATED",
          entityType: "CalendarRegionAlias",
          entityId: alias.id,
          metadata: {
            regionId,
            after: aliasSnapshot(alias),
          },
        },
      });

      return alias;
    });
  } catch (error) {
    if (error instanceof RegionRegistryError) {
      throw error;
    }
    throw mapPrismaConflict(error, "alias");
  }
}

export async function updateCalendarRegionAlias(
  regionId: string,
  aliasId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(updateCalendarRegionAliasSchema, input);

  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.calendarRegionAlias.findFirst({
        where: {
          id: aliasId,
          regionId,
        },
        include: {
          region: true,
        },
      });
      if (!before) {
        throw new RegionRegistryError(
          "ALIAS_NOT_FOUND",
          "Calendar-region alias was not found.",
          404,
        );
      }

      const canonical = isCanonicalRegionAlias(
        before.region.code,
        before.normalizedAlias,
      );
      if (
        canonical &&
        parsed.alias !== undefined &&
        normalizeRegionAlias(parsed.alias) !==
          normalizeRegionAlias(before.region.code)
      ) {
        throw new RegionRegistryError(
          "CANONICAL_ALIAS_REQUIRED",
          "The canonical region-code alias cannot be renamed.",
          409,
        );
      }
      if (
        canonical &&
        before.region.isActive &&
        parsed.isActive === false
      ) {
        throw new RegionRegistryError(
          "CANONICAL_ALIAS_REQUIRED",
          "The canonical region-code alias must stay active while its region is active.",
          409,
        );
      }

      const alias = await tx.calendarRegionAlias.update({
        where: { id: aliasId },
        data: {
          ...(parsed.alias !== undefined
            ? {
                alias: parsed.alias,
                normalizedAlias: normalizeRegionAlias(parsed.alias),
              }
            : {}),
          ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
        },
        include: {
          region: {
            select: {
              code: true,
              displayName: true,
              isActive: true,
            },
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          userId: actorId,
          action: aliasAction(before.isActive, alias.isActive),
          entityType: "CalendarRegionAlias",
          entityId: alias.id,
          metadata: {
            regionId,
            before: aliasSnapshot(before),
            after: aliasSnapshot(alias),
          },
        },
      });

      return alias;
    });
  } catch (error) {
    if (error instanceof RegionRegistryError) {
      throw error;
    }
    throw mapPrismaConflict(error, "alias");
  }
}

function parseInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  throw new RegionRegistryError(
    "INVALID_INPUT",
    result.error.issues[0]?.message ?? "Invalid calendar-region input.",
    400,
  );
}

function mapPrismaConflict(
  error: unknown,
  target: "region" | "alias",
): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new RegionRegistryError(
      target === "region" ? "REGION_CONFLICT" : "ALIAS_CONFLICT",
      target === "region"
        ? "That calendar-region code already exists, or one of its initial aliases is already owned by another region."
        : "That normalized alias is already owned by another calendar region.",
      409,
    );
  }

  return error instanceof Error ? error : new Error("Unknown region-registry failure.");
}

function regionAction(before: boolean, after: boolean): string {
  if (before && !after) {
    return "CALENDAR_REGION_DEACTIVATED";
  }
  if (!before && after) {
    return "CALENDAR_REGION_REACTIVATED";
  }
  return "CALENDAR_REGION_UPDATED";
}

function aliasAction(before: boolean, after: boolean): string {
  if (before && !after) {
    return "CALENDAR_REGION_ALIAS_DEACTIVATED";
  }
  if (!before && after) {
    return "CALENDAR_REGION_ALIAS_REACTIVATED";
  }
  return "CALENDAR_REGION_ALIAS_UPDATED";
}

function regionSnapshot(region: {
  id: string;
  code: string;
  displayName: string;
  isActive: boolean;
  aliases: Array<{
    id: string;
    alias: string;
    normalizedAlias: string;
    isActive: boolean;
  }>;
}) {
  return {
    id: region.id,
    code: region.code,
    displayName: region.displayName,
    isActive: region.isActive,
    aliases: region.aliases.map((alias) => ({
      id: alias.id,
      alias: alias.alias,
      normalizedAlias: alias.normalizedAlias,
      isActive: alias.isActive,
    })),
  };
}

function aliasSnapshot(alias: {
  id: string;
  alias: string;
  normalizedAlias: string;
  isActive: boolean;
  region: {
    code: string;
    isActive: boolean;
  };
}) {
  return {
    id: alias.id,
    alias: alias.alias,
    normalizedAlias: alias.normalizedAlias,
    isActive: alias.isActive,
    regionCode: alias.region.code,
    regionIsActive: alias.region.isActive,
  };
}
