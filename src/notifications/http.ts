import { NotificationJobError } from "@/notifications/jobs";
import {
  NotificationApprovalError,
} from "@/notifications/notification-approval";
import { NotificationPlanningError } from "@/notifications/planning";
import {
  NotificationDeliveryReconciliationError,
} from "@/notifications/delivery-reconciliation";
import { NotificationPolicyError } from "@/notifications/policy";

export async function readNotificationJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function notificationErrorResponse(error: unknown, operation: string): Response {
  if (
    error instanceof NotificationPolicyError ||
    error instanceof NotificationPlanningError ||
    error instanceof NotificationJobError ||
    error instanceof NotificationApprovalError ||
    error instanceof NotificationDeliveryReconciliationError
  ) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  console.error(`Notification ${operation} failed.`, error);
  return Response.json(
    { error: `Notification ${operation} failed.`, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
