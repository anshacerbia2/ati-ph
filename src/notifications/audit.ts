import type {
  PrismaClient,
} from "@prisma/client";

export async function listNotificationAuditEvents(
  database: PrismaClient,
  input: {
    limit?: number;
  } = {},
) {
  const limit = input.limit ?? 50;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 200
  ) {
    throw new Error(
      "Notification audit limit must be between 1 and 200.",
    );
  }

  const rows = await database.auditEvent.findMany({
    where: {
      OR: [
        {
          action: {
            startsWith: "NOTIFICATION_",
          },
        },
        {
          action:
            "IMPORT_BATCH_PUBLISHED",
        },
      ],
    },
    orderBy: [
      { occurredAt: "desc" },
      { id: "desc" },
    ],
    take: limit,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
      occurredAt: true,
      user: {
        select: {
          email: true,
          displayName: true,
        },
      },
    },
  });

  return {
    count: rows.length,
    events: rows.map((row) => ({
      id: row.id.toString(),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      occurredAt:
        row.occurredAt.toISOString(),
      actor: row.user
        ? {
            email: row.user.email,
            displayName:
              row.user.displayName,
          }
        : null,
    })),
  };
}
