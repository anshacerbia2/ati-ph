import {
  PERMISSIONS,
} from "@/auth/authorization-catalog";
import {
  authorizeRoute,
} from "@/auth/route-access";
import {
  getServerEnv,
} from "@/config/server-env";
import {
  resolveEmailAutomaticDeliveryRelease,
} from "@/email/automatic-delivery-release";
import { db } from "@/lib/db";
import {
  getNotificationOperationsOverview,
} from "@/notifications/operations";
import {
  notificationErrorResponse,
} from "@/notifications/http";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_PLAN_READ,
  );
  if (!access.ok) {
    return access.response;
  }

  try {
    const env = getServerEnv();
    const smtp =
      resolveEmailAutomaticDeliveryRelease();

    return Response.json(
      await getNotificationOperationsOverview(
        db,
        {
          trustedAutomationEnabled:
            env.NOTIFICATION_TRUSTED_AUTOMATION_ENABLED ===
            "true",
          smtpAutomaticDeliveryEnabled:
            smtp.smtpAutomaticDeliveryEnabled,
          smtpKillSwitchActive:
            smtp.killSwitchActive,
          smtpCanExecuteAutomatically:
            smtp.canExecuteSmtpAutomatically,
          workerEnabled:
            env.NOTIFICATION_WORKER_ENABLED ===
            "true",
          workerPollIntervalMs:
            env.WORKER_POLL_INTERVAL_MS,
        },
      ),
    );
  } catch (error) {
    return notificationErrorResponse(
      error,
      "operations overview",
    );
  }
}
