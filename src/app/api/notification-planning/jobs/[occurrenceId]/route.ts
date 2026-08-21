import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { notificationErrorResponse } from "@/notifications/http";
import { listOccurrenceJobs } from "@/notifications/job-inspection";

export const runtime = "nodejs";

/**
 * What was committed for this occurrence, and what became of it.
 *
 * Behind `NOTIFICATION_PLAN_READ` — the same permission as the plan preview, and
 * deliberately not a narrower one. The preview already discloses which clients match
 * and which addresses would receive the notification; this shows the same routing
 * after the fact, plus the provider's answer. Anyone entitled to see the plan is
 * entitled to see whether it worked.
 *
 * `?jobId=` narrows to one job and includes its frozen email body. The list omits
 * bodies: one occurrence has a job per matching subscription, and sending every body
 * to render a column of subjects would be megabytes for a table.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ occurrenceId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_PLAN_READ,
  );
  if (!access.ok) return access.response;

  try {
    const { occurrenceId } = await params;
    const jobId =
      new URL(request.url).searchParams.get("jobId") ??
      undefined;

    return Response.json(
      await listOccurrenceJobs({ occurrenceId, jobId }),
    );
  } catch (error) {
    return notificationErrorResponse(
      error,
      "occurrence job inspection",
    );
  }
}
