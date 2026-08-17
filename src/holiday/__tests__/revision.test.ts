import { describe, expect, it } from "vitest";

import {
  collectRevisionTargetIds,
  isNewOccurrenceRevision,
  normalizeRevisionId,
  validateRevisionTargetStates,
} from "@/holiday/revision";

const NEW_ROW_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

describe("holiday revision control", () => {
  it("treats the system row UUID as a new occurrence revision id", () => {
    expect(
      isNewOccurrenceRevision({
        id: NEW_ROW_ID,
        revisionId: NEW_ROW_ID,
      }),
    ).toBe(true);
  });

  it("normalizes a valid revision UUID", () => {
    expect(normalizeRevisionId(TARGET_ID.toUpperCase())).toEqual({
      ok: true,
      value: TARGET_ID,
    });
  });

  it("rejects duplicate revision targets in one staging batch", () => {
    expect(
      collectRevisionTargetIds([
        {
          id: NEW_ROW_ID,
          revisionId: TARGET_ID,
          status: "VALID",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          revisionId: TARGET_ID,
          status: "VALID",
        },
      ]),
    ).toMatchObject({
      ok: false,
      code: "DUPLICATE_REVISION_TARGET",
      revisionId: TARGET_ID,
    });
  });

  it("rejects a revision id that is not published", () => {
    expect(
      validateRevisionTargetStates(
        [
          {
            id: NEW_ROW_ID,
            revisionId: TARGET_ID,
            status: "VALID",
          },
        ],
        [],
      ),
    ).toMatchObject({
      ok: false,
      code: "REVISION_TARGET_NOT_FOUND",
    });
  });

  it("rejects a superseded revision target", () => {
    expect(
      validateRevisionTargetStates(
        [
          {
            id: NEW_ROW_ID,
            revisionId: TARGET_ID,
            status: "VALID",
          },
        ],
        [
          {
            id: TARGET_ID,
            supersededAt: "2026-08-17T00:00:00.000Z",
            notificationCommittedAt: null,
          },
        ],
      ),
    ).toMatchObject({
      ok: false,
      code: "REVISION_TARGET_SUPERSEDED",
    });
  });

  it("rejects a target after notification commitment", () => {
    expect(
      validateRevisionTargetStates(
        [
          {
            id: NEW_ROW_ID,
            revisionId: TARGET_ID,
            status: "VALID",
          },
        ],
        [
          {
            id: TARGET_ID,
            supersededAt: null,
            notificationCommittedAt:
              "2026-08-17T00:00:00.000Z",
          },
        ],
      ),
    ).toMatchObject({
      ok: false,
      code: "REVISION_TARGET_NOTIFICATION_COMMITTED",
    });
  });

  it("allows a current published target before notification commitment", () => {
    expect(
      validateRevisionTargetStates(
        [
          {
            id: NEW_ROW_ID,
            revisionId: TARGET_ID,
            status: "VALID",
          },
        ],
        [
          {
            id: TARGET_ID,
            supersededAt: null,
            notificationCommittedAt: null,
          },
        ],
      ),
    ).toEqual({
      ok: true,
      targetIds: [TARGET_ID],
    });
  });
});
