import "server-only";

import { db } from "@/lib/db";

export async function loadActiveRegionAliases(): Promise<Map<string, string>> {
  const aliases = await db.calendarRegionAlias.findMany({
    where: {
      isActive: true,
      region: { isActive: true },
    },
    select: {
      normalizedAlias: true,
      region: { select: { code: true } },
    },
  });

  return new Map(
    aliases.map(({ normalizedAlias, region }) => [
      normalizedAlias,
      region.code,
    ]),
  );
}
