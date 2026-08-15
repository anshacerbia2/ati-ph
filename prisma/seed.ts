import { PrismaClient } from "@prisma/client";

import {
  ROLE_PERMISSION_CODES,
  SYSTEM_MENUS,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
} from "../src/auth/authorization-catalog";
import { normalizeLookupKey } from "../src/lib/lookup-key";

const db = new PrismaClient();

const regions = [
  { code: "AU", displayName: "Australia", aliases: ["Australia", "AU"] },
  { code: "ID", displayName: "Indonesia", aliases: ["Indonesia", "ID"] },
  {
    code: "GB",
    displayName: "United Kingdom",
    aliases: ["United Kingdom", "UK", "GB"],
  },
  { code: "ZA", displayName: "South Africa", aliases: ["South Africa", "ZA"] },
  {
    code: "NA",
    displayName: "North America",
    aliases: ["North America", "NA"],
  },
  { code: "NZ", displayName: "New Zealand", aliases: ["New Zealand", "NZ"] },
  { code: "SG", displayName: "Singapore", aliases: ["Singapore", "SG"] },
] as const;

async function seedAuthorization(): Promise<void> {
  const roles = new Map<string, { id: string }>();

  for (const definition of SYSTEM_ROLES) {
    const role = await db.role.upsert({
      where: { code: definition.code },
      create: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      update: {
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      select: { id: true },
    });
    roles.set(definition.code, role);
  }

  const permissions = new Map<string, { id: string }>();

  for (const definition of SYSTEM_PERMISSIONS) {
    const permission = await db.permission.upsert({
      where: { code: definition.code },
      create: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      update: {
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      select: { id: true },
    });
    permissions.set(definition.code, permission);
  }

  for (const [roleCode, permissionCodes] of Object.entries(
    ROLE_PERMISSION_CODES,
  )) {
    const role = roles.get(roleCode);
    if (!role) {
      throw new Error(`Missing seeded role ${roleCode}.`);
    }

    for (const permissionCode of permissionCodes) {
      const permission = permissions.get(permissionCode);
      if (!permission) {
        throw new Error(`Missing seeded permission ${permissionCode}.`);
      }

      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }
  }

  const menus = new Map<string, { id: string }>();

  for (const definition of SYSTEM_MENUS) {
    const requiredPermission = definition.requiredPermission
      ? permissions.get(definition.requiredPermission)
      : undefined;

    if (definition.requiredPermission && !requiredPermission) {
      throw new Error(
        `Missing menu permission ${definition.requiredPermission}.`,
      );
    }

    const menu = await db.menu.upsert({
      where: { code: definition.code },
      create: {
        code: definition.code,
        label: definition.label,
        path: definition.path,
        requiredPermissionId: requiredPermission?.id,
        sortOrder: definition.sortOrder,
      },
      update: {
        label: definition.label,
        path: definition.path ?? null,
        requiredPermissionId: requiredPermission?.id ?? null,
        sortOrder: definition.sortOrder,
      },
      select: { id: true },
    });

    menus.set(definition.code, menu);
  }

  for (const definition of SYSTEM_MENUS) {
    const menu = menus.get(definition.code);
    if (!menu) {
      throw new Error(`Missing seeded menu ${definition.code}.`);
    }

    const parent = definition.parentCode
      ? menus.get(definition.parentCode)
      : undefined;

    if (definition.parentCode && !parent) {
      throw new Error(
        `Missing menu parent ${definition.parentCode} for ${definition.code}.`,
      );
    }

    await db.menu.update({
      where: { id: menu.id },
      data: { parentId: parent?.id ?? null },
    });
  }
}

async function seedCalendarRegions(): Promise<void> {
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
          where: { normalizedAlias: normalizeLookupKey(alias) },
          create: {
            regionId: region.id,
            alias,
            normalizedAlias: normalizeLookupKey(alias),
          },
          update: {},
        });
      }
    }
  });
}

async function main(): Promise<void> {
  await seedAuthorization();
  await seedCalendarRegions();
  console.info("ATI PH authorization and calendar-region bootstrap complete.");
}

main()
  .catch((error: unknown) => {
    console.error("ATI PH seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
