import { PrismaClient } from "@prisma/client";

import {
  ROLE_PERMISSION_CODES,
  SYSTEM_MENUS,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
} from "../src/auth/authorization-catalog";
import {
  normalizeClientName,
  normalizeContactEmail,
  normalizeServiceTeamName,
} from "../src/clients/routing";
import { normalizeLookupKey } from "../src/lib/lookup-key";
import { CLIENT_MASTER_ROUTING_SEED } from "./seed-data/client-master-routing";

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

async function cleanupIncorrectFctgAggregateBootstrap(): Promise<void> {
  const normalizedName = normalizeClientName("FCTG");
  const aggregate = await db.client.findUnique({
    where: { normalizedName },
    include: {
      serviceTeams: {
        select: { id: true, normalizedName: true },
      },
      contacts: {
        select: { normalizedEmail: true },
      },
    },
  });

  if (!aggregate) return;

  const expectedTeamNames = new Set(
    CLIENT_MASTER_ROUTING_SEED.records.map((record) =>
      normalizeServiceTeamName(record.clientName),
    ),
  );
  const expectedEmails = new Set(
    CLIENT_MASTER_ROUTING_SEED.records.flatMap((record) =>
      [...record.to, ...record.cc].map(normalizeContactEmail),
    ),
  );

  const looksLikeIncorrectBootstrap =
    aggregate.serviceTeams.length === expectedTeamNames.size &&
    aggregate.serviceTeams.every((team) =>
      expectedTeamNames.has(team.normalizedName),
    ) &&
    aggregate.contacts.length === expectedEmails.size &&
    aggregate.contacts.every((contact) =>
      expectedEmails.has(contact.normalizedEmail),
    );

  if (!looksLikeIncorrectBootstrap) {
    console.warn(
      "FCTG aggregate client exists but does not match the previous generated bootstrap fingerprint; leaving it untouched.",
    );
    return;
  }

  const teamIds = aggregate.serviceTeams.map((team) => team.id);
  const subscriptions = await db.clientSubscription.findMany({
    where: { serviceTeamId: { in: teamIds } },
    select: { id: true },
  });
  const subscriptionIds = subscriptions.map((subscription) => subscription.id);

  await db.$transaction(async (tx) => {
    if (subscriptionIds.length > 0) {
      await tx.subscriptionRecipient.deleteMany({
        where: { subscriptionId: { in: subscriptionIds } },
      });
      await tx.clientSubscription.deleteMany({
        where: { id: { in: subscriptionIds } },
      });
    }

    if (teamIds.length > 0) {
      await tx.serviceTeam.deleteMany({
        where: { id: { in: teamIds } },
      });
    }

    await tx.contact.deleteMany({
      where: { clientId: aggregate.id },
    });

    await tx.client.delete({
      where: { id: aggregate.id },
    });
  });

  console.info(
    "Removed the previous incorrect FCTG-as-one-client bootstrap aggregate.",
  );
}

async function seedClientMasterRouting(): Promise<void> {
  const source = CLIENT_MASTER_ROUTING_SEED;
  const regionRows = await db.calendarRegion.findMany({
    select: { id: true, displayName: true },
  });
  const regionByName = new Map(
    regionRows.map((region) => [region.displayName, region]),
  );

  await cleanupIncorrectFctgAggregateBootstrap();

  let contactCount = 0;
  let assignmentCount = 0;

  for (const record of source.records) {
    const normalizedClientName = normalizeClientName(record.clientName);
    const isActive = record.status === "Active";

    const client = await db.client.upsert({
      where: { normalizedName: normalizedClientName },
      create: {
        name: record.clientName,
        normalizedName: normalizedClientName,
        isActive,
      },
      update: {},
      select: { id: true },
    });

    // Client_Master has no distinct Service Team column. Preserve all routing
    // data without inventing a label by projecting the source Client Name
    // one-to-one into ServiceTeam for the current subscription hierarchy.
    const normalizedTeamName = normalizeServiceTeamName(record.clientName);
    const team = await db.serviceTeam.upsert({
      where: {
        clientId_normalizedName: {
          clientId: client.id,
          normalizedName: normalizedTeamName,
        },
      },
      create: {
        clientId: client.id,
        name: record.clientName,
        normalizedName: normalizedTeamName,
        isActive,
      },
      update: {},
      select: { id: true },
    });

    const region = regionByName.get(record.region);
    if (!region) {
      throw new Error(
        `Client_Master seed references unknown calendar region ${record.region}.`,
      );
    }

    let subscription = await db.clientSubscription.findFirst({
      where: {
        serviceTeamId: team.id,
        calendarRegionId: region.id,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (!subscription) {
      subscription = await db.clientSubscription.create({
        data: {
          serviceTeamId: team.id,
          calendarRegionId: region.id,
          effectiveFrom: null,
          effectiveTo: null,
          isActive,
        },
        select: { id: true },
      });
    }

    const policy = await db.notificationPolicy.upsert({
      where: { clientSubscriptionId: subscription.id },
      create: { clientSubscriptionId: subscription.id, isActive: true },
      update: {},
      select: { id: true },
    });

    const existingPolicyVersion = await db.notificationPolicyVersion.findFirst({
      where: { notificationPolicyId: policy.id },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    if (!existingPolicyVersion) {
      await db.notificationPolicyVersion.create({
        data: {
          notificationPolicyId: policy.id,
          version: 1,
          holidayDayFilter: record.dayFilter === "Weekdays" ? "WEEKDAY" : "WEEKEND",
          leadTimeValue: null,
          leadTimeMode: null,
          sendTimeLocal: null,
          timezone: null,
          weekendAdjustment: "UNCONFIRMED",
          businessDayHolidayMode: "UNCONFIRMED",
          approvalMode: "UNCONFIRMED",
          automaticSendAllowed: false,
          retryCeiling: null,
          isActive: true,
          changeReason: "Migrated from Client_Master.Tag",
        },
      });
    }

    const assignments = [
      ...record.to.map((email) => ({
        email,
        recipientType: "TO" as const,
      })),
      ...record.cc.map((email) => ({
        email,
        recipientType: "CC" as const,
      })),
    ];

    for (const assignment of assignments) {
      const normalizedEmail = normalizeContactEmail(assignment.email);
      const existingContact = await db.contact.findUnique({
        where: {
          clientId_normalizedEmail: {
            clientId: client.id,
            normalizedEmail,
          },
        },
        select: { id: true },
      });

      const contact =
        existingContact ??
        (await db.contact.create({
          data: {
            clientId: client.id,
            displayName: null,
            email: assignment.email,
            normalizedEmail,
            isActive: true,
          },
          select: { id: true },
        }));

      if (!existingContact) contactCount += 1;

      const existingRecipient = await db.subscriptionRecipient.findUnique({
        where: {
          subscriptionId_contactId: {
            subscriptionId: subscription.id,
            contactId: contact.id,
          },
        },
        select: { subscriptionId: true },
      });

      await db.subscriptionRecipient.upsert({
        where: {
          subscriptionId_contactId: {
            subscriptionId: subscription.id,
            contactId: contact.id,
          },
        },
        create: {
          subscriptionId: subscription.id,
          contactId: contact.id,
          recipientType: assignment.recipientType,
          isActive: true,
        },
        update: {},
      });

      if (!existingRecipient) assignmentCount += 1;
    }
  }

  console.info(
    `Client_Master bootstrap complete: ${source.records.length} clients, ${source.records.length} compatibility service teams, ${contactCount} contacts created, ${assignmentCount} recipient assignments created.`,
  );
}


async function seedMissingNotificationPolicyShells(): Promise<void> {
  const subscriptions = await db.clientSubscription.findMany({
    where: { notificationPolicy: null },
    select: { id: true },
  });

  for (const subscription of subscriptions) {
    await db.notificationPolicy.create({
      data: { clientSubscriptionId: subscription.id },
    });
  }

  if (subscriptions.length > 0) {
    console.info(
      "Notification-policy shells created for " + subscriptions.length + " existing subscriptions.",
    );
  }
}


async function main(): Promise<void> {
  await seedAuthorization();
  await seedCalendarRegions();
  await seedClientMasterRouting();
  await seedMissingNotificationPolicyShells();
  console.info("ATI PH authorization, calendar-region, client-routing, and notification-policy bootstrap complete.");
}

main()
  .catch((error: unknown) => {
    console.error("ATI PH seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
