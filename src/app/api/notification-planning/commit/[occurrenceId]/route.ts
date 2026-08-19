import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { notificationErrorResponse } from "@/notifications/http";
import { commitOccurrenceNotificationPlan } from "@/notifications/jobs";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ occurrenceId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_PLAN_COMMIT,
  );
  if (!access.ok) return access.response;

  try {
    const { occurrenceId } = await params;
    const result = await commitOccurrenceNotificationPlan(
      occurrenceId,
      access.session.user.id,
    );

    return Response.json(result, { status: 201 });
  } catch (error) {
    return notificationErrorResponse(
      error,
      "plan commit",
    );
  }
}
