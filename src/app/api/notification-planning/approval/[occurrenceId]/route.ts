import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  notificationErrorResponse,
  readNotificationJson,
} from "@/notifications/http";
import {
  decideNotificationPlanApproval,
  getNotificationPlanApprovalState,
  requestNotificationPlanApproval,
} from "@/notifications/notification-approval";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ occurrenceId: string }>;
  },
): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_PLAN_READ,
  );
  if (!access.ok) return access.response;

  try {
    const { occurrenceId } = await params;
    return Response.json(
      await getNotificationPlanApprovalState(
        occurrenceId,
        access.session.user.id,
      ),
    );
  } catch (error) {
    return notificationErrorResponse(
      error,
      "approval state",
    );
  }
}

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ occurrenceId: string }>;
  },
): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_PLAN_COMMIT,
  );
  if (!access.ok) return access.response;

  try {
    const { occurrenceId } = await params;
    const result =
      await requestNotificationPlanApproval(
        occurrenceId,
        access.session.user.id,
      );

    return Response.json(result, { status: 201 });
  } catch (error) {
    return notificationErrorResponse(
      error,
      "approval request",
    );
  }
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ occurrenceId: string }>;
  },
): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_PLAN_APPROVE,
  );
  if (!access.ok) return access.response;

  try {
    const body = await readNotificationJson(request);
    const input =
      body && typeof body === "object"
        ? (body as {
            decision?: unknown;
            reason?: unknown;
          })
        : {};

    const decision =
      input.decision === "APPROVE" ||
      input.decision === "REJECT"
        ? input.decision
        : "INVALID";

    const reason =
      typeof input.reason === "string"
        ? input.reason
        : "";

    const { occurrenceId } = await params;

    if (decision === "INVALID") {
      return Response.json(
        {
          error:
            "decision must be APPROVE or REJECT.",
          code: "NOTIFICATION_APPROVAL_INVALID_DECISION",
        },
        { status: 400 },
      );
    }

    return Response.json(
      await decideNotificationPlanApproval(
        occurrenceId,
        access.session.user.id,
        { decision, reason },
      ),
    );
  } catch (error) {
    return notificationErrorResponse(
      error,
      "approval decision",
    );
  }
}
