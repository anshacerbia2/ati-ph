import { describe, expect, it } from "vitest";

import {
  notificationApprovalListState,
} from "@/notifications/approval-list-state";

describe("notification approval list state", () => {
  it("keeps uncommitted occurrences outside the approval lifecycle", () => {
    expect(
      notificationApprovalListState({
        committed: false,
        latestApprovalStatus: null,
        waitingApprovalCount: 0,
      }),
    ).toBe("NOT_COMMITTED");
  });

  it("shows approval required before a request exists", () => {
    expect(
      notificationApprovalListState({
        committed: true,
        latestApprovalStatus: null,
        waitingApprovalCount: 33,
      }),
    ).toBe("REQUIRED");
  });

  it("shows a pending request before raw waiting-job counts", () => {
    expect(
      notificationApprovalListState({
        committed: true,
        latestApprovalStatus: "PENDING",
        waitingApprovalCount: 33,
      }),
    ).toBe("PENDING");
  });

  it("shows approved after maker-checker approval", () => {
    expect(
      notificationApprovalListState({
        committed: true,
        latestApprovalStatus: "APPROVED",
        waitingApprovalCount: 0,
      }),
    ).toBe("APPROVED");
  });

  it("shows rejected after maker-checker rejection", () => {
    expect(
      notificationApprovalListState({
        committed: true,
        latestApprovalStatus: "REJECTED",
        waitingApprovalCount: 0,
      }),
    ).toBe("REJECTED");
  });

  it("shows no approval when committed jobs do not require approval", () => {
    expect(
      notificationApprovalListState({
        committed: true,
        latestApprovalStatus: null,
        waitingApprovalCount: 0,
      }),
    ).toBe("NOT_REQUIRED");
  });

  it("falls back to required after a cancelled request when jobs still wait", () => {
    expect(
      notificationApprovalListState({
        committed: true,
        latestApprovalStatus: "CANCELLED",
        waitingApprovalCount: 4,
      }),
    ).toBe("REQUIRED");
  });
});
