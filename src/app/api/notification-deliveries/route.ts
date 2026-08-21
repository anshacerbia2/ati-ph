import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { db } from "@/lib/db";
import { parseDeliveryListQuery } from "@/notifications/delivery-query";
import { notificationErrorResponse } from "@/notifications/http";
import {
  listDeliveries,
  listOccurrenceJobs,
} from "@/notifications/job-inspection";

export const runtime = "nodejs";

/**
 * Committed jobs across every occurrence — the audit view.
 *
 * `?jobId=` returns that one job with its frozen email body, so the list and the
 * evidence share a route and a caller never has to know which of two endpoints holds
 * which half of the answer.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await authorizeRoute(
    PERMISSIONS.NOTIFICATION_PLAN_READ,
  );
  if (!access.ok) return access.response;

  try {
    const searchParams = new URL(request.url).searchParams;
    const jobId = searchParams.get("jobId");

    if (jobId) {
      /*
       * The occurrence is read from the job rather than taken from the caller.
       *
       * A caller-supplied pair is two facts that can disagree, and the disagreement is
       * a way to ask "does this job id exist" separately from "may I see it".
       */
      const job = await db.notificationJob.findUnique({
        where: { id: jobId },
        select: { holidayOccurrenceId: true },
      });

      if (!job) {
        return Response.json(
          { error: "Notification job was not found." },
          { status: 404 },
        );
      }

      return Response.json(
        await listOccurrenceJobs({
          occurrenceId: job.holidayOccurrenceId,
          jobId,
        }),
      );
    }

    const query = parseDeliveryListQuery({
      search: searchParams.get("search"),
      status: searchParams.get("status"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });

    return Response.json(await listDeliveries(query));
  } catch (error) {
    return notificationErrorResponse(error, "delivery list");
  }
}
