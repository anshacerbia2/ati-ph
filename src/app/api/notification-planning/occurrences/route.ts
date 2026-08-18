import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { notificationErrorResponse } from "@/notifications/http";
import { parseNotificationListQuery } from "@/notifications/list-query";
import { listPublishedOccurrences } from "@/notifications/planning";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.NOTIFICATION_PLAN_READ);
  if (!access.ok) return access.response;

  try {
    const searchParams = new URL(request.url).searchParams;
    const query = parseNotificationListQuery({
      search: searchParams.get("search"),
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });
    return Response.json(await listPublishedOccurrences(query));
  } catch (error) {
    return notificationErrorResponse(error, "planning occurrence list");
  }
}
