import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  listAlertHistory,
  parseAlertHistoryQuery,
} from "@/notifications/alert-history";
import { notificationErrorResponse } from "@/notifications/http";

export const runtime = "nodejs";

/**
 * Operational alerts including resolved ones.
 *
 * The overview endpoint keeps its open-alert summary — that is the "is anything wrong
 * now" answer and belongs on the panel without a request of its own. This is the
 * separate question: has this been happening.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_PLAN_READ,
  );
  if (!access.ok) return access.response;

  try {
    const searchParams = new URL(request.url).searchParams;

    return Response.json(
      await listAlertHistory(
        parseAlertHistoryQuery({
          status: searchParams.get("status"),
          type: searchParams.get("type"),
          page: searchParams.get("page"),
        }),
      ),
    );
  } catch (error) {
    return notificationErrorResponse(error, "alert history");
  }
}
