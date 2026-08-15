import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const regions = [
  { code: "AU", displayName: "Australia", aliases: ["Australia", "AU"] },
  { code: "ID", displayName: "Indonesia", aliases: ["Indonesia", "ID"] },
  { code: "GB", displayName: "United Kingdom", aliases: ["United Kingdom", "UK", "GB"] },
  { code: "ZA", displayName: "South Africa", aliases: ["South Africa", "ZA"] },
  { code: "NA", displayName: "North America", aliases: ["North America", "NA"] },
  { code: "NZ", displayName: "New Zealand", aliases: ["New Zealand", "NZ"] },
  { code: "SG", displayName: "Singapore", aliases: ["Singapore", "SG"] },
] as const;

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main(): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const definition of regions) {
      const region = await tx.calendarRegion.upsert({
        where: { code: definition.code },
        create: {
          code: definition.code,
          displayName: definition.displayName,
        },
        update: {},
      });

      for (const alias of definition.aliases) {
        await tx.calendarRegionAlias.upsert({
          where: { normalizedAlias: normalizeAlias(alias) },
          create: {
            regionId: region.id,
            alias,
            normalizedAlias: normalizeAlias(alias),
          },
          update: {},
        });
      }
    }
  });

  console.info("ATI PH governed calendar-region bootstrap complete.");
}

main()
  .catch((error: unknown) => {
    console.error("ATI PH seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
