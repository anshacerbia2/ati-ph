import {
  PERMISSIONS,
} from "@/auth/authorization-catalog";
import {
  authorizeRoute,
} from "@/auth/route-access";
import { db } from "@/lib/db";
import {
  listNotificationAuditEvents,
} from "@/notifications/audit";
import {
  notificationErrorResponse,
} from "@/notifications/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_PLAN_READ,
  );
  if (!access.ok) {
    return access.response;
  }

  try {
    const rawLimit =
      new URL(request.url).searchParams.get(
        "limit",
      );
    const limit = rawLimit
      ? Number.parseInt(rawLimit, 10)
      : 50;

    return Response.json(
      await listNotificationAuditEvents(
        db,
        { limit },
      ),
    );
  } catch (error) {
    return notificationErrorResponse(
      error,
      "notification audit",
    );
  }
}
