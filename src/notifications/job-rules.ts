export function initialNotificationJobStatus(
  approvalRequired: boolean,
): "WAITING_APPROVAL" | "PLANNED" {
  return approvalRequired ? "WAITING_APPROVAL" : "PLANNED";
}
