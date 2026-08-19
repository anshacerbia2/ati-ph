import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  createGlobalNotificationScheduleVersion,
} from "@/notifications/global-schedule";
import {
  notificationErrorResponse,
  readNotificationJson,
} from "@/notifications/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_POLICY_MANAGE,
  );
  if (!access.ok) return access.response;

  try {
    const body = await readNotificationJson(request);
    const version = await createGlobalNotificationScheduleVersion(
      body,
      access.session.user.id,
    );
    return Response.json({ version }, { status: 201 });
  } catch (error) {
    return notificationErrorResponse(error, "global schedule version create");
  }
}
