import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { notificationErrorResponse, readNotificationJson } from "@/notifications/http";
import { createNotificationPolicyVersion } from "@/notifications/policy";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ policyId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.NOTIFICATION_POLICY_MANAGE);
  if (!access.ok) return access.response;

  try {
    const { policyId } = await params;
    const body = await readNotificationJson(request);
    const version = await createNotificationPolicyVersion(
      policyId,
      body,
      access.session.user.id,
    );
    return Response.json({ version }, { status: 201 });
  } catch (error) {
    return notificationErrorResponse(error, "policy version create");
  }
}
