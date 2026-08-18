import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { notificationErrorResponse } from "@/notifications/http";
import { previewOccurrenceMatching } from "@/notifications/planning";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ occurrenceId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.NOTIFICATION_PLAN_READ);
  if (!access.ok) return access.response;

  try {
    const { occurrenceId } = await params;
    return Response.json(await previewOccurrenceMatching(occurrenceId));
  } catch (error) {
    return notificationErrorResponse(error, "matching preview");
  }
}
