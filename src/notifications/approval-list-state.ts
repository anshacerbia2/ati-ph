export type NotificationApprovalListState =
  | "NOT_COMMITTED"
  | "NOT_REQUIRED"
  | "REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export function notificationApprovalListState(input: {
  committed: boolean;
  latestApprovalStatus:
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "CANCELLED"
    | null;
  waitingApprovalCount: number;
}): NotificationApprovalListState {
  if (!input.committed) return "NOT_COMMITTED";

  if (input.latestApprovalStatus === "PENDING") {
    return "PENDING";
  }

  if (input.latestApprovalStatus === "APPROVED") {
    return "APPROVED";
  }

  if (input.latestApprovalStatus === "REJECTED") {
    return "REJECTED";
  }

  if (input.waitingApprovalCount > 0) {
    return "REQUIRED";
  }

  return "NOT_REQUIRED";
}
