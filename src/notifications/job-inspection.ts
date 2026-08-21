import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  NOTIFICATION_JOB_STATUSES,
  type DeliveryListQuery,
} from "@/notifications/delivery-query";

/**
 * What happened to committed notification jobs, and the evidence for it.
 *
 * ## Why this exists
 *
 * Everything here was already recorded and none of it was readable. The delivery
 * surface showed only the reconciliation queue — attempts stuck on `OUTCOME_UNKNOWN` —
 * which is empty whenever the system is working, so the one screen about delivery was
 * blank precisely when delivery was fine. A successful send left `providerMessageId`,
 * `acceptedRecipients` and a frozen, hashed copy of the exact email in the database,
 * and no screen read any of it.
 *
 * The question this answers is the one asked after every complaint: **what did this
 * client actually receive, and when.**
 *
 * ## Why the body is fetched separately
 *
 * `contentSnapshot.html` is a whole email. An occurrence matches one job per
 * subscription, and this estate already has fifty — sending every body to render a list
 * would be megabytes to show a column of subjects. A list carries the subject and the
 * hash; asking for one job returns its body.
 */

export type NotificationJobAttemptView = {
  id: string;
  attemptNumber: number;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  acceptedRecipients: string[];
  rejectedRecipients: string[];
  failureClass: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  claimedAt: string;
  completedAt: string | null;
  /** How long the attempt was held, once it finished. Null while still claimed. */
  durationMs: number | null;
  leaseExpiresAt: string;
  leaseRetrySafe: boolean;
  reconciliation: {
    action: string;
    note: string | null;
    at: string | null;
    by: string | null;
  } | null;
};

export type NotificationJobView = {
  id: string;
  status: string;
  approvalMode: string;
  automaticSendAllowed: boolean;
  scheduledAt: string;
  plannedLocalDate: string;
  plannedLocalTime: string;
  timezone: string;
  sentAt: string | null;
  failedAt: string | null;
  retryAt: string | null;
  attemptCount: number;
  retryCeiling: number | null;
  lastError: string | null;
  holiday: {
    occurrenceId: string;
    name: string;
    startDate: string;
    endDate: string;
    /** Set when a corrected import replaced this occurrence. */
    supersededAt: string | null;
  };
  client: { name: string; serviceTeam: string };
  recipients: { to: string[]; cc: string[] };
  content: {
    subject: string | null;
    sha256: string | null;
    /** Present only when a single job was requested. */
    html: string | null;
  };
  attempts: NotificationJobAttemptView[];
};

/**
 * The relations every job view needs, named once.
 *
 * Two callers read jobs — one occurrence's committed plan, and the cross-occurrence
 * delivery list — and a view that differed between them would be two shapes the UI had
 * to tell apart for no reason a reader could see.
 */
const JOB_INCLUDE = {
  subscription: {
    include: {
      serviceTeam: { include: { client: true } },
    },
  },
  occurrence: {
    include: { definition: true },
  },
  deliveryAttempts: {
    orderBy: { attemptNumber: "asc" },
    include: {
      reconciledBy: {
        select: { email: true, displayName: true },
      },
    },
  },
} satisfies Prisma.NotificationJobInclude;

type JobWithRelations = Prisma.NotificationJobGetPayload<{
  include: typeof JOB_INCLUDE;
}>;

/**
 * Reads the frozen snapshots defensively.
 *
 * These are `Json` columns written by earlier versions of this application, and a job
 * committed before frozen content existed has none. An inspection screen that threw on
 * the first such row would be unusable for exactly the historical jobs somebody is most
 * likely to be looking up.
 */
function addresses(value: unknown, key: "to" | "cc"): string[] {
  if (!value || typeof value !== "object") return [];

  const list = (value as Record<string, unknown>)[key];
  if (!Array.isArray(list)) return [];

  return list
    .map((entry) =>
      entry && typeof entry === "object"
        ? String((entry as Record<string, unknown>).email ?? "")
        : String(entry ?? ""),
    )
    .filter((email) => email.length > 0);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry)).filter(Boolean)
    : [];
}

function contentField(
  value: unknown,
  key: "subject" | "html",
): string | null {
  if (!value || typeof value !== "object") return null;

  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toJobView(
  job: JobWithRelations,
  includeBody: boolean,
): NotificationJobView {
  return {
    id: job.id,
    status: job.status,
    approvalMode: job.approvalMode,
    automaticSendAllowed: job.automaticSendAllowed,
    scheduledAt: job.scheduledAt.toISOString(),
    plannedLocalDate: dateKey(job.plannedLocalDate),
    plannedLocalTime: job.plannedLocalTime,
    timezone: job.timezone,
    sentAt: job.sentAt?.toISOString() ?? null,
    failedAt: job.failedAt?.toISOString() ?? null,
    retryAt: job.retryAt?.toISOString() ?? null,
    attemptCount: job.attemptCount,
    retryCeiling: job.retryCeiling,
    lastError: job.lastError,
    holiday: {
      occurrenceId: job.holidayOccurrenceId,
      name: job.occurrence.definition.canonicalName,
      startDate: dateKey(job.occurrence.startDate),
      endDate: dateKey(job.occurrence.endDate),
      supersededAt:
        job.occurrence.supersededAt?.toISOString() ?? null,
    },
    client: {
      name: job.subscription.serviceTeam.client.name,
      serviceTeam: job.subscription.serviceTeam.name,
    },
    recipients: {
      to: addresses(job.recipientSnapshot, "to"),
      cc: addresses(job.recipientSnapshot, "cc"),
    },
    content: {
      subject: contentField(job.contentSnapshot, "subject"),
      sha256: job.contentSha256,
      html: includeBody
        ? contentField(job.contentSnapshot, "html")
        : null,
    },
    attempts: job.deliveryAttempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      provider: attempt.provider,
      providerMessageId: attempt.providerMessageId,
      acceptedRecipients: stringList(attempt.acceptedRecipients),
      rejectedRecipients: stringList(attempt.rejectedRecipients),
      failureClass: attempt.failureClass,
      errorCode: attempt.errorCode,
      errorMessage: attempt.errorMessage,
      claimedAt: attempt.claimedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString() ?? null,
      durationMs: attempt.completedAt
        ? attempt.completedAt.getTime() -
          attempt.claimedAt.getTime()
        : null,
      leaseExpiresAt: attempt.leaseExpiresAt.toISOString(),
      leaseRetrySafe: attempt.leaseRetrySafe,
      reconciliation: attempt.reconciliationAction
        ? {
            action: attempt.reconciliationAction,
            note: attempt.reconciliationNote,
            at: attempt.reconciledAt?.toISOString() ?? null,
            by:
              attempt.reconciledBy?.displayName ??
              attempt.reconciledBy?.email ??
              null,
          }
        : null,
    })),
  };
}

export async function listOccurrenceJobs(input: {
  occurrenceId: string;
  jobId?: string;
}): Promise<{ jobs: NotificationJobView[] }> {
  const includeBody = Boolean(input.jobId);

  const jobs = await db.notificationJob.findMany({
    where: {
      holidayOccurrenceId: input.occurrenceId,
      ...(input.jobId ? { id: input.jobId } : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    include: JOB_INCLUDE,
  });

  return {
    jobs: jobs.map((job) => toJobView(job, includeBody)),
  };
}

export type DeliveryListResult = {
  jobs: NotificationJobView[];
  /**
   * Counts for the current filter *ignoring the status facet*, so the status chips can
   * show what selecting each one would find. Computing them from the filtered set would
   * make every unselected status read zero, which is the opposite of a facet.
   */
  statusCounts: Record<string, number>;
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    total: number;
    from: number;
    to: number;
  };
};

/**
 * Jobs across every occurrence, filtered for audit.
 *
 * The search runs over the three names somebody actually remembers — the holiday, the
 * client, the service team. Recipient address is deliberately not searchable here: it
 * lives in a frozen JSON snapshot that no index covers, and a scan of every job's
 * recipients would be a slow query with a fast-looking box in front of it.
 */
export async function listDeliveries(
  query: DeliveryListQuery,
): Promise<DeliveryListResult> {
  const textFilter = {
    contains: query.search,
    mode: "insensitive" as const,
  };

  const scope: Prisma.NotificationJobWhereInput = {
    ...(query.search
      ? {
          OR: [
            {
              occurrence: {
                definition: { canonicalName: textFilter },
              },
            },
            {
              subscription: {
                serviceTeam: { name: textFilter },
              },
            },
            {
              subscription: {
                serviceTeam: { client: { name: textFilter } },
              },
            },
          ],
        }
      : {}),
    ...(query.from || query.to
      ? {
          plannedLocalDate: {
            ...(query.from
              ? { gte: new Date(`${query.from}T00:00:00.000Z`) }
              : {}),
            ...(query.to
              ? { lte: new Date(`${query.to}T00:00:00.000Z`) }
              : {}),
          },
        }
      : {}),
  };

  const where: Prisma.NotificationJobWhereInput = {
    ...scope,
    ...(query.statuses.length > 0
      ? { status: { in: query.statuses } }
      : {}),
  };

  const [total, facetRows] = await Promise.all([
    db.notificationJob.count({ where }),
    db.notificationJob.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(
    NOTIFICATION_JOB_STATUSES.map((status) => [
      status,
      facetRows.find((row) => row.status === status)?._count
        ._all ?? 0,
    ]),
  );

  const pageCount = Math.max(
    1,
    Math.ceil(total / query.pageSize),
  );
  const page = Math.min(query.page, pageCount);
  const offset = (page - 1) * query.pageSize;

  const jobs = await db.notificationJob.findMany({
    where,
    /*
     * Newest planned first. An audit starts from "what happened recently", and the
     * occurrence list next door is already the ascending, forward-looking view.
     */
    orderBy: [{ plannedLocalDate: "desc" }, { id: "asc" }],
    skip: offset,
    take: query.pageSize,
    include: JOB_INCLUDE,
  });

  return {
    jobs: jobs.map((job) => toJobView(job, false)),
    statusCounts,
    pagination: {
      page,
      pageSize: query.pageSize,
      pageCount,
      total,
      from: total === 0 ? 0 : offset + 1,
      to:
        total === 0
          ? 0
          : Math.min(offset + query.pageSize, total),
    },
  };
}
