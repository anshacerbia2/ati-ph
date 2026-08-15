import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  RegionRegistryError,
  updateCalendarRegion,
} from "@/holiday/region-registry";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ regionId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.CALENDAR_REGION_MANAGE);
  if (!access.ok) {
    return access.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Expected a JSON request body." },
      { status: 400 },
    );
  }

  const { regionId } = await params;

  try {
    const region = await updateCalendarRegion(
      regionId,
      body,
      access.session.user.id,
    );
    return Response.json({ region });
  } catch (error) {
    if (error instanceof RegionRegistryError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    console.error("ATI PH calendar-region update failed.", error);
    return Response.json(
      { error: "Calendar-region update failed." },
      { status: 500 },
    );
  }
}
