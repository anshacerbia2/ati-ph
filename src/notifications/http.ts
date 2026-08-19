import { NotificationJobError } from "@/notifications/jobs";
import { NotificationPlanningError } from "@/notifications/planning";
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
    error instanceof NotificationJobError
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
