import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { db } from "@/lib/db";
import {
  NotificationDeliveryReconciliationError,
  reconcileNotificationDeliveryAttempt,
} from "@/notifications/delivery-reconciliation";
import type {
  NotificationDeliveryReconciliationAction,
} from "@/notifications/delivery-reconciliation-rules";
import {
  notificationErrorResponse,
  readNotificationJson,
} from "@/notifications/http";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ attemptId: string }>;
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
            action?: unknown;
            note?: unknown;
          })
        : {};
    const action =
      parseAction(input.action);
    const note =
      typeof input.note === "string"
        ? input.note
        : "";
    const { attemptId } = await params;

    return Response.json(
      await reconcileNotificationDeliveryAttempt(
        db,
        {
          attemptId,
          userId: access.session.user.id,
          action,
          note,
        },
      ),
    );
  } catch (error) {
    return notificationErrorResponse(
      error,
      "delivery reconciliation",
    );
  }
}

function parseAction(
  value: unknown,
): NotificationDeliveryReconciliationAction {
  if (
    value === "MARK_SENT" ||
    value === "RETRY" ||
    value === "FAIL"
  ) {
    return value;
  }

  throw new NotificationDeliveryReconciliationError(
    "DELIVERY_RECONCILIATION_INVALID_INPUT",
    "Reconciliation action must be MARK_SENT, RETRY, or FAIL.",
    400,
  );
}
