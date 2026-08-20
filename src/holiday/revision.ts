import type { PrismaClient } from "@prisma/client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RevisionStagingRow = {
  id: string;
  revisionId: string;
  status: "VALID" | "INVALID" | "EXCLUDED";
};

export type RevisionTargetState = {
  id: string;
  supersededAt: Date | string | null;
  notificationCommittedAt: Date | string | null;
};

export type RevisionValidationCode =
  | "INVALID_REVISION_ID"
  | "DUPLICATE_REVISION_TARGET"
  | "REVISION_TARGET_NOT_FOUND"
  | "REVISION_TARGET_SUPERSEDED";

export type RevisionValidation =
  | {
      ok: true;
      targetIds: string[];
    }
  | {
      ok: false;
      code: RevisionValidationCode;
      revisionId: string;
      reason: string;
    };

type RevisionReader = Pick<PrismaClient, "holidayOccurrence">;

export function normalizeRevisionId(
  value: unknown,
):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  if (typeof value !== "string") {
    return {
      ok: false,
      error: "Revision ID must be a holiday occurrence UUID.",
    };
  }

  const normalized = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: "Revision ID must be a valid holiday occurrence UUID.",
    };
  }

  return { ok: true, value: normalized };
}

export function isNewOccurrenceRevision(
  row: Pick<RevisionStagingRow, "id" | "revisionId">,
): boolean {
  return row.id === row.revisionId;
}

export function collectRevisionTargetIds(
  rows: readonly RevisionStagingRow[],
): RevisionValidation {
  const targetIds: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.status === "EXCLUDED") {
      continue;
    }

    if (!UUID_PATTERN.test(row.revisionId)) {
      return {
        ok: false,
        code: "INVALID_REVISION_ID",
        revisionId: row.revisionId,
        reason:
          "Revision ID must be a valid holiday occurrence UUID.",
      };
    }

    if (isNewOccurrenceRevision(row)) {
      continue;
    }

    if (seen.has(row.revisionId)) {
      return {
        ok: false,
        code: "DUPLICATE_REVISION_TARGET",
        revisionId: row.revisionId,
        reason:
          "Two staging rows cannot revise the same published holiday occurrence.",
      };
    }

    seen.add(row.revisionId);
    targetIds.push(row.revisionId);
  }

  targetIds.sort();

  return { ok: true, targetIds };
}

export function validateRevisionTargetStates(
  rows: readonly RevisionStagingRow[],
  targets: readonly RevisionTargetState[],
): RevisionValidation {
  const collected = collectRevisionTargetIds(rows);
  if (!collected.ok) {
    return collected;
  }

  const targetById = new Map(
    targets.map((target) => [target.id, target]),
  );

  for (const revisionId of collected.targetIds) {
    const target = targetById.get(revisionId);

    if (!target) {
      return {
        ok: false,
        code: "REVISION_TARGET_NOT_FOUND",
        revisionId,
        reason:
          `Revision ID ${revisionId} does not reference a published holiday occurrence.`,
      };
    }

    if (target.supersededAt) {
      return {
        ok: false,
        code: "REVISION_TARGET_SUPERSEDED",
        revisionId,
        reason:
          `Revision ID ${revisionId} has already been superseded and cannot be revised again.`,
      };
    }
  }

  return collected;
}

export type RevisionNotificationJobStatus =
  | "WAITING_APPROVAL"
  | "PLANNED"
  | "DUE"
  | "PROCESSING"
  | "RETRY_WAIT"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

export type RevisionDeliveryBoundary =
  | {
      ok: true;
      cancellableCount: number;
      sentCount: number;
    }
  | {
      ok: false;
      reason: string;
    };

export function revisionDeliveryBoundary(
  statuses: readonly RevisionNotificationJobStatus[],
): RevisionDeliveryBoundary {
  if (
    statuses.some(
      (status) => status === "PROCESSING",
    )
  ) {
    return {
      ok: false,
      reason:
        "A notification delivery is currently PROCESSING. Wait for delivery completion or recovery before publishing the correction.",
    };
  }

  const cancellable = new Set<
    RevisionNotificationJobStatus
  >([
    "WAITING_APPROVAL",
    "PLANNED",
    "DUE",
    "RETRY_WAIT",
  ]);

  return {
    ok: true,
    cancellableCount: statuses.filter(
      (status) => cancellable.has(status),
    ).length,
    sentCount: statuses.filter(
      (status) => status === "SENT",
    ).length,
  };
}

export async function validateRevisionTargets(
  reader: RevisionReader,
  rows: readonly RevisionStagingRow[],
): Promise<RevisionValidation> {
  const collected = collectRevisionTargetIds(rows);
  if (!collected.ok || collected.targetIds.length === 0) {
    return collected;
  }

  const targets = await reader.holidayOccurrence.findMany({
    where: {
      id: { in: collected.targetIds },
    },
    select: {
      id: true,
      supersededAt: true,
      notificationCommittedAt: true,
    },
  });

  return validateRevisionTargetStates(rows, targets);
}
