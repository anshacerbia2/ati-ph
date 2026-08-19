import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  effectiveWindowsOverlap,
  isSafeTestRecipientEmail,
  normalizeClientName,
  normalizeContactEmail,
  normalizeServiceTeamName,
  validateEffectiveWindow,
} from "@/clients/routing";
import type { ClientListQuery } from "@/clients/list-query";
import { db } from "@/lib/db";

export class ClientRoutingError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "CLIENT_NOT_FOUND"
      | "TEAM_NOT_FOUND"
      | "CONTACT_NOT_FOUND"
      | "SUBSCRIPTION_NOT_FOUND"
      | "RECIPIENT_NOT_FOUND"
      | "REGION_NOT_FOUND"
      | "CLIENT_CONFLICT"
      | "TEAM_CONFLICT"
      | "CONTACT_CONFLICT"
      | "SUBSCRIPTION_OVERLAP"
      | "INACTIVE_PARENT"
      | "CROSS_CLIENT_RECIPIENT",
    message: string,
    public readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "ClientRoutingError";
  }
}

const clientConfigurationInclude = {
  contacts: {
    orderBy: [
      { isActive: "desc" as const },
      { displayName: "asc" as const },
      { email: "asc" as const },
    ],
  },
  serviceTeams: {
    orderBy: [
      { isActive: "desc" as const },
      { name: "asc" as const },
    ],
    include: {
      subscriptions: {
        orderBy: [
          { isActive: "desc" as const },
          { effectiveFrom: "asc" as const },
          { createdAt: "asc" as const },
        ],
        include: {
          calendarRegion: {
            select: {
              id: true,
              code: true,
              displayName: true,
              isActive: true,
            },
          },
          recipients: {
            orderBy: [
              { isActive: "desc" as const },
              { createdAt: "asc" as const },
            ],
            include: {
              contact: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ClientInclude;

const nameSchema = z.string().trim().min(1).max(200);
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .refine(
    isSafeTestRecipientEmail,
    "Recipient email must use @dummy.test while notification delivery is in shadow/testing mode.",
  );
const uuidSchema = z.string().uuid();
const dateSchema = z.union([
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.null(),
]);

const createClientSchema = z.object({
  name: nameSchema,
});

const updateClientSchema = z
  .object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(hasDefinedValue, "At least one client field must be provided.");

const createServiceTeamSchema = z.object({
  name: nameSchema,
});

const updateServiceTeamSchema = z
  .object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(hasDefinedValue, "At least one service-team field must be provided.");

const createContactSchema = z.object({
  displayName: z.string().trim().max(200).nullable().optional(),
  email: emailSchema,
});

const updateContactSchema = z
  .object({
    displayName: z.string().trim().max(200).nullable().optional(),
    email: emailSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(hasDefinedValue, "At least one contact field must be provided.");

const createSubscriptionSchema = z.object({
  calendarRegionId: uuidSchema,
  effectiveFrom: dateSchema.optional(),
  effectiveTo: dateSchema.optional(),
});

const updateSubscriptionSchema = z
  .object({
    effectiveFrom: dateSchema.optional(),
    effectiveTo: dateSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(hasDefinedValue, "At least one subscription field must be provided.");

const recipientTypeSchema = z.enum(["TO", "CC"]);

const assignRecipientSchema = z.object({
  contactId: uuidSchema,
  recipientType: recipientTypeSchema.default("TO"),
});

const updateRecipientSchema = z
  .object({
    isActive: z.boolean().optional(),
    recipientType: recipientTypeSchema.optional(),
  })
  .refine(hasDefinedValue, "At least one recipient field must be provided.");

export async function listClientRoutingConfiguration(
  query: ClientListQuery,
) {
  const where: Prisma.ClientWhereInput = query.search
    ? {
        name: {
          contains: query.search,
          mode: "insensitive",
        },
      }
    : {};

  const total = await db.client.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const offset = (page - 1) * query.pageSize;

  const [clients, regions] = await Promise.all([
    db.client.findMany({
      where,
      include: clientConfigurationInclude,
      orderBy: [
        { isActive: "desc" },
        { name: "asc" },
        { id: "asc" },
      ],
      skip: offset,
      take: query.pageSize,
    }),
    db.calendarRegion.findMany({
      orderBy: [
        { isActive: "desc" },
        { code: "asc" },
      ],
      select: {
        id: true,
        code: true,
        displayName: true,
        isActive: true,
      },
    }),
  ]);

  return {
    clients,
    regions,
    pagination: {
      page,
      pageSize: query.pageSize,
      pageCount,
      total,
      from: total === 0 ? 0 : offset + 1,
      to: total === 0 ? 0 : Math.min(offset + query.pageSize, total),
    },
  };
}

export async function createClient(input: unknown, actorId: string) {
  const parsed = parseInput(createClientSchema, input);
  const normalizedName = normalizeClientName(parsed.name);

  try {
    return await db.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          name: parsed.name,
          normalizedName,
        },
      });

      await writeAudit(
        tx,
        actorId,
        "CLIENT_CREATED",
        "Client",
        client.id,
        { after: clientSnapshot(client) },
      );

      return client;
    });
  } catch (error) {
    throw mapConflict(error, "CLIENT_CONFLICT", "That client already exists.");
  }
}

export async function updateClient(
  clientId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(updateClientSchema, input);

  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.client.findUnique({ where: { id: clientId } });
      if (!before) {
        throw new ClientRoutingError(
          "CLIENT_NOT_FOUND",
          "Client was not found.",
          404,
        );
      }

      const client = await tx.client.update({
        where: { id: clientId },
        data: {
          ...(parsed.name !== undefined
            ? {
                name: parsed.name,
                normalizedName: normalizeClientName(parsed.name),
              }
            : {}),
          ...(parsed.isActive !== undefined
            ? { isActive: parsed.isActive }
            : {}),
        },
      });

      await writeAudit(
        tx,
        actorId,
        stateAction("CLIENT", before.isActive, client.isActive),
        "Client",
        client.id,
        {
          before: clientSnapshot(before),
          after: clientSnapshot(client),
        },
      );

      return client;
    });
  } catch (error) {
    if (error instanceof ClientRoutingError) throw error;
    throw mapConflict(error, "CLIENT_CONFLICT", "That client already exists.");
  }
}

export async function createServiceTeam(
  clientId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(createServiceTeamSchema, input);

  try {
    return await db.$transaction(async (tx) => {
      await requireActiveClient(tx, clientId);

      const team = await tx.serviceTeam.create({
        data: {
          clientId,
          name: parsed.name,
          normalizedName: normalizeServiceTeamName(parsed.name),
        },
      });

      await writeAudit(
        tx,
        actorId,
        "SERVICE_TEAM_CREATED",
        "ServiceTeam",
        team.id,
        { clientId, after: serviceTeamSnapshot(team) },
      );

      return team;
    });
  } catch (error) {
    if (error instanceof ClientRoutingError) throw error;
    throw mapConflict(
      error,
      "TEAM_CONFLICT",
      "That service-team name already exists for this client.",
    );
  }
}

export async function updateServiceTeam(
  clientId: string,
  teamId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(updateServiceTeamSchema, input);

  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.serviceTeam.findFirst({
        where: { id: teamId, clientId },
        include: { client: true },
      });
      if (!before) {
        throw new ClientRoutingError(
          "TEAM_NOT_FOUND",
          "Service team was not found for this client.",
          404,
        );
      }

      if (parsed.isActive === true && !before.client.isActive) {
        throw new ClientRoutingError(
          "INACTIVE_PARENT",
          "An inactive client cannot have a reactivated service team.",
          409,
        );
      }

      const team = await tx.serviceTeam.update({
        where: { id: teamId },
        data: {
          ...(parsed.name !== undefined
            ? {
                name: parsed.name,
                normalizedName: normalizeServiceTeamName(parsed.name),
              }
            : {}),
          ...(parsed.isActive !== undefined
            ? { isActive: parsed.isActive }
            : {}),
        },
      });

      await writeAudit(
        tx,
        actorId,
        stateAction("SERVICE_TEAM", before.isActive, team.isActive),
        "ServiceTeam",
        team.id,
        {
          clientId,
          before: serviceTeamSnapshot(before),
          after: serviceTeamSnapshot(team),
        },
      );

      return team;
    });
  } catch (error) {
    if (error instanceof ClientRoutingError) throw error;
    throw mapConflict(
      error,
      "TEAM_CONFLICT",
      "That service-team name already exists for this client.",
    );
  }
}

export async function createContact(
  clientId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(createContactSchema, input);

  try {
    return await db.$transaction(async (tx) => {
      await requireActiveClient(tx, clientId);

      const contact = await tx.contact.create({
        data: {
          clientId,
          displayName: cleanNullableText(parsed.displayName),
          email: parsed.email,
          normalizedEmail: normalizeContactEmail(parsed.email),
        },
      });

      await writeAudit(
        tx,
        actorId,
        "CONTACT_CREATED",
        "Contact",
        contact.id,
        { clientId, after: contactSnapshot(contact) },
      );

      return contact;
    });
  } catch (error) {
    if (error instanceof ClientRoutingError) throw error;
    throw mapConflict(
      error,
      "CONTACT_CONFLICT",
      "That email address already exists for this client.",
    );
  }
}

export async function updateContact(
  clientId: string,
  contactId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(updateContactSchema, input);

  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.contact.findFirst({
        where: { id: contactId, clientId },
        include: { client: true },
      });
      if (!before) {
        throw new ClientRoutingError(
          "CONTACT_NOT_FOUND",
          "Contact was not found for this client.",
          404,
        );
      }

      if (parsed.isActive === true && !before.client.isActive) {
        throw new ClientRoutingError(
          "INACTIVE_PARENT",
          "An inactive client cannot have a reactivated contact.",
          409,
        );
      }

      const contact = await tx.contact.update({
        where: { id: contactId },
        data: {
          ...(parsed.displayName !== undefined
            ? { displayName: cleanNullableText(parsed.displayName) }
            : {}),
          ...(parsed.email !== undefined
            ? {
                email: parsed.email,
                normalizedEmail: normalizeContactEmail(parsed.email),
              }
            : {}),
          ...(parsed.isActive !== undefined
            ? { isActive: parsed.isActive }
            : {}),
        },
      });

      await writeAudit(
        tx,
        actorId,
        stateAction("CONTACT", before.isActive, contact.isActive),
        "Contact",
        contact.id,
        {
          clientId,
          before: contactSnapshot(before),
          after: contactSnapshot(contact),
        },
      );

      return contact;
    });
  } catch (error) {
    if (error instanceof ClientRoutingError) throw error;
    throw mapConflict(
      error,
      "CONTACT_CONFLICT",
      "That email address already exists for this client.",
    );
  }
}

export async function createSubscription(
  clientId: string,
  teamId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(createSubscriptionSchema, input);
  const effectiveFrom = parsed.effectiveFrom ?? null;
  const effectiveTo = parsed.effectiveTo ?? null;

  assertValidWindow({ effectiveFrom, effectiveTo });

  return db.$transaction(async (tx) => {
    const team = await tx.serviceTeam.findFirst({
      where: { id: teamId, clientId },
      include: { client: true },
    });
    if (!team) {
      throw new ClientRoutingError(
        "TEAM_NOT_FOUND",
        "Service team was not found for this client.",
        404,
      );
    }
    if (!team.isActive || !team.client.isActive) {
      throw new ClientRoutingError(
        "INACTIVE_PARENT",
        "Subscriptions can only be created for an active client and service team.",
        409,
      );
    }

    const region = await tx.calendarRegion.findUnique({
      where: { id: parsed.calendarRegionId },
    });
    if (!region) {
      throw new ClientRoutingError(
        "REGION_NOT_FOUND",
        "Calendar region was not found.",
        404,
      );
    }
    if (!region.isActive) {
      throw new ClientRoutingError(
        "INACTIVE_PARENT",
        "An inactive calendar region cannot be subscribed.",
        409,
      );
    }

    await assertNoActiveOverlap(tx, {
      serviceTeamId: teamId,
      calendarRegionId: region.id,
      effectiveFrom,
      effectiveTo,
    });

    const subscription = await tx.clientSubscription.create({
      data: {
        serviceTeamId: teamId,
        calendarRegionId: region.id,
        effectiveFrom: dateValue(effectiveFrom),
        effectiveTo: dateValue(effectiveTo),
        notificationPolicy: {
          create: {},
        },
      },
      include: {
        calendarRegion: {
          select: { code: true, displayName: true },
        },
      },
    });

    await writeAudit(
      tx,
      actorId,
      "CLIENT_SUBSCRIPTION_CREATED",
      "ClientSubscription",
      subscription.id,
      {
        clientId,
        after: subscriptionSnapshot(subscription),
      },
    );

    return subscription;
  });
}

export async function updateSubscription(
  clientId: string,
  teamId: string,
  subscriptionId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(updateSubscriptionSchema, input);

  return db.$transaction(async (tx) => {
    const before = await tx.clientSubscription.findFirst({
      where: {
        id: subscriptionId,
        serviceTeamId: teamId,
        serviceTeam: { clientId },
      },
      include: {
        calendarRegion: true,
        serviceTeam: { include: { client: true } },
      },
    });
    if (!before) {
      throw new ClientRoutingError(
        "SUBSCRIPTION_NOT_FOUND",
        "Subscription was not found for this service team.",
        404,
      );
    }

    const effectiveFrom =
      parsed.effectiveFrom !== undefined
        ? parsed.effectiveFrom
        : before.effectiveFrom;
    const effectiveTo =
      parsed.effectiveTo !== undefined
        ? parsed.effectiveTo
        : before.effectiveTo;
    const isActive =
      parsed.isActive !== undefined ? parsed.isActive : before.isActive;

    assertValidWindow({ effectiveFrom, effectiveTo });

    if (
      isActive &&
      (!before.serviceTeam.isActive ||
        !before.serviceTeam.client.isActive ||
        !before.calendarRegion.isActive)
    ) {
      throw new ClientRoutingError(
        "INACTIVE_PARENT",
        "An active subscription requires an active client, service team, and calendar region.",
        409,
      );
    }

    if (isActive) {
      await assertNoActiveOverlap(tx, {
        serviceTeamId: teamId,
        calendarRegionId: before.calendarRegionId,
        effectiveFrom,
        effectiveTo,
        excludeSubscriptionId: subscriptionId,
      });
    }

    const subscription = await tx.clientSubscription.update({
      where: { id: subscriptionId },
      data: {
        ...(parsed.effectiveFrom !== undefined
          ? { effectiveFrom: dateValue(parsed.effectiveFrom) }
          : {}),
        ...(parsed.effectiveTo !== undefined
          ? { effectiveTo: dateValue(parsed.effectiveTo) }
          : {}),
        ...(parsed.isActive !== undefined
          ? { isActive: parsed.isActive }
          : {}),
      },
      include: {
        calendarRegion: {
          select: { code: true, displayName: true },
        },
      },
    });

    await writeAudit(
      tx,
      actorId,
      stateAction(
        "CLIENT_SUBSCRIPTION",
        before.isActive,
        subscription.isActive,
      ),
      "ClientSubscription",
      subscription.id,
      {
        clientId,
        before: subscriptionSnapshot(before),
        after: subscriptionSnapshot(subscription),
      },
    );

    return subscription;
  });
}

export async function assignSubscriptionRecipient(
  clientId: string,
  teamId: string,
  subscriptionId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(assignRecipientSchema, input);

  return db.$transaction(async (tx) => {
    const subscription = await tx.clientSubscription.findFirst({
      where: {
        id: subscriptionId,
        serviceTeamId: teamId,
        serviceTeam: { clientId },
      },
    });
    if (!subscription) {
      throw new ClientRoutingError(
        "SUBSCRIPTION_NOT_FOUND",
        "Subscription was not found for this service team.",
        404,
      );
    }

    const contact = await tx.contact.findUnique({
      where: { id: parsed.contactId },
    });
    if (!contact) {
      throw new ClientRoutingError(
        "CONTACT_NOT_FOUND",
        "Contact was not found.",
        404,
      );
    }
    if (contact.clientId !== clientId) {
      throw new ClientRoutingError(
        "CROSS_CLIENT_RECIPIENT",
        "A recipient must belong to the same client as the subscription.",
        409,
      );
    }
    if (!contact.isActive) {
      throw new ClientRoutingError(
        "INACTIVE_PARENT",
        "An inactive contact cannot be assigned as an active recipient.",
        409,
      );
    }

    const before = await tx.subscriptionRecipient.findUnique({
      where: {
        subscriptionId_contactId: {
          subscriptionId,
          contactId: contact.id,
        },
      },
    });

    const recipient = await tx.subscriptionRecipient.upsert({
      where: {
        subscriptionId_contactId: {
          subscriptionId,
          contactId: contact.id,
        },
      },
      create: {
        subscriptionId,
        contactId: contact.id,
        recipientType: parsed.recipientType,
      },
      update: {
        recipientType: parsed.recipientType,
        isActive: true,
      },
    });

    await writeAudit(
      tx,
      actorId,
      recipientAuditAction(before?.isActive, recipient.isActive),
      "SubscriptionRecipient",
      `${subscriptionId}:${contact.id}`,
      {
        clientId,
        subscriptionId,
        contactId: contact.id,
        before: before ? recipientSnapshot(before) : null,
        after: recipientSnapshot(recipient),
      },
    );

    return recipient;
  });
}

export async function updateSubscriptionRecipient(
  clientId: string,
  teamId: string,
  subscriptionId: string,
  contactId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(updateRecipientSchema, input);

  return db.$transaction(async (tx) => {
    const before = await tx.subscriptionRecipient.findUnique({
      where: {
        subscriptionId_contactId: {
          subscriptionId,
          contactId,
        },
      },
      include: {
        contact: true,
        subscription: {
          include: {
            serviceTeam: true,
          },
        },
      },
    });

    if (
      !before ||
      before.subscription.serviceTeamId !== teamId ||
      before.subscription.serviceTeam.clientId !== clientId
    ) {
      throw new ClientRoutingError(
        "RECIPIENT_NOT_FOUND",
        "Subscription recipient was not found.",
        404,
      );
    }

    if (before.contact.clientId !== clientId) {
      throw new ClientRoutingError(
        "CROSS_CLIENT_RECIPIENT",
        "A recipient must belong to the same client as the subscription.",
        409,
      );
    }

    if (parsed.isActive === true && !before.contact.isActive) {
      throw new ClientRoutingError(
        "INACTIVE_PARENT",
        "An inactive contact cannot be reactivated as a recipient.",
        409,
      );
    }

    const recipient = await tx.subscriptionRecipient.update({
      where: {
        subscriptionId_contactId: {
          subscriptionId,
          contactId,
        },
      },
      data: {
        ...(parsed.isActive !== undefined
          ? { isActive: parsed.isActive }
          : {}),
        ...(parsed.recipientType !== undefined
          ? { recipientType: parsed.recipientType }
          : {}),
      },
    });

    await writeAudit(
      tx,
      actorId,
      recipientAuditAction(before.isActive, recipient.isActive),
      "SubscriptionRecipient",
      `${subscriptionId}:${contactId}`,
      {
        clientId,
        subscriptionId,
        contactId,
        before: recipientSnapshot(before),
        after: recipientSnapshot(recipient),
      },
    );

    return recipient;
  });
}

async function requireActiveClient(
  tx: Prisma.TransactionClient,
  clientId: string,
) {
  const client = await tx.client.findUnique({ where: { id: clientId } });
  if (!client) {
    throw new ClientRoutingError(
      "CLIENT_NOT_FOUND",
      "Client was not found.",
      404,
    );
  }
  if (!client.isActive) {
    throw new ClientRoutingError(
      "INACTIVE_PARENT",
      "This operation requires an active client.",
      409,
    );
  }
  return client;
}

async function assertNoActiveOverlap(
  tx: Prisma.TransactionClient,
  input: {
    serviceTeamId: string;
    calendarRegionId: string;
    effectiveFrom: Date | string | null;
    effectiveTo: Date | string | null;
    excludeSubscriptionId?: string;
  },
) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${input.serviceTeamId}),
      hashtext(${input.calendarRegionId})
    )
  `;

  const existing = await tx.clientSubscription.findMany({
    where: {
      serviceTeamId: input.serviceTeamId,
      calendarRegionId: input.calendarRegionId,
      isActive: true,
      ...(input.excludeSubscriptionId
        ? { id: { not: input.excludeSubscriptionId } }
        : {}),
    },
    select: {
      id: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });

  if (
    existing.some((candidate) =>
      effectiveWindowsOverlap(candidate, input),
    )
  ) {
    throw new ClientRoutingError(
      "SUBSCRIPTION_OVERLAP",
      "An active subscription for this service team and region already overlaps that effective window.",
      409,
    );
  }
}

function assertValidWindow(input: {
  effectiveFrom: Date | string | null;
  effectiveTo: Date | string | null;
}) {
  const result = validateEffectiveWindow(input);
  if (!result.ok) {
    throw new ClientRoutingError(
      "INVALID_INPUT",
      result.reason,
      400,
    );
  }
}

function dateValue(value: Date | string | null): Date | null {
  if (value === null) return null;
  if (value instanceof Date) return value;
  return new Date(`${value}T00:00:00.000Z`);
}

function cleanNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function hasDefinedValue(value: Record<string, unknown>): boolean {
  return Object.values(value).some((item) => item !== undefined);
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw new ClientRoutingError(
    "INVALID_INPUT",
    result.error.issues[0]?.message ?? "Invalid client-routing input.",
    400,
  );
}

function mapConflict(
  error: unknown,
  code: "CLIENT_CONFLICT" | "TEAM_CONFLICT" | "CONTACT_CONFLICT",
  message: string,
): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new ClientRoutingError(code, message, 409);
  }

  return error instanceof Error
    ? error
    : new Error("Unknown client-routing failure.");
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await tx.auditEvent.create({
    data: {
      userId: actorId,
      action,
      entityType,
      entityId,
      metadata: metadata as Prisma.InputJsonObject,
    },
  });
}

function stateAction(
  prefix: string,
  before: boolean,
  after: boolean,
): string {
  if (before && !after) return `${prefix}_DEACTIVATED`;
  if (!before && after) return `${prefix}_REACTIVATED`;
  return `${prefix}_UPDATED`;
}

function recipientAuditAction(
  before: boolean | undefined,
  after: boolean,
): string {
  if (before === undefined) return "SUBSCRIPTION_RECIPIENT_ASSIGNED";
  if (before && !after) return "SUBSCRIPTION_RECIPIENT_DEACTIVATED";
  if (!before && after) return "SUBSCRIPTION_RECIPIENT_REACTIVATED";
  return "SUBSCRIPTION_RECIPIENT_UPDATED";
}

function clientSnapshot(client: {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
}) {
  return {
    id: client.id,
    name: client.name,
    normalizedName: client.normalizedName,
    isActive: client.isActive,
  };
}

function serviceTeamSnapshot(team: {
  id: string;
  clientId: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
}) {
  return {
    id: team.id,
    clientId: team.clientId,
    name: team.name,
    normalizedName: team.normalizedName,
    isActive: team.isActive,
  };
}

function contactSnapshot(contact: {
  id: string;
  clientId: string;
  displayName: string | null;
  email: string;
  normalizedEmail: string;
  isActive: boolean;
}) {
  return {
    id: contact.id,
    clientId: contact.clientId,
    displayName: contact.displayName,
    email: contact.email,
    normalizedEmail: contact.normalizedEmail,
    isActive: contact.isActive,
  };
}

function subscriptionSnapshot(subscription: {
  id: string;
  serviceTeamId: string;
  calendarRegionId: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  isActive: boolean;
}) {
  return {
    id: subscription.id,
    serviceTeamId: subscription.serviceTeamId,
    calendarRegionId: subscription.calendarRegionId,
    effectiveFrom: subscription.effectiveFrom?.toISOString().slice(0, 10) ?? null,
    effectiveTo: subscription.effectiveTo?.toISOString().slice(0, 10) ?? null,
    isActive: subscription.isActive,
  };
}

function recipientSnapshot(recipient: {
  subscriptionId: string;
  contactId: string;
  recipientType: "TO" | "CC";
  isActive: boolean;
}) {
  return {
    subscriptionId: recipient.subscriptionId,
    contactId: recipient.contactId,
    recipientType: recipient.recipientType,
    isActive: recipient.isActive,
  };
}
