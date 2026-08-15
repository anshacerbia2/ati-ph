import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  createCalendarRegionAlias,
  RegionRegistryError,
} from "@/holiday/region-registry";

export const runtime = "nodejs";

export async function POST(
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
    const alias = await createCalendarRegionAlias(
      regionId,
      body,
      access.session.user.id,
    );
    return Response.json({ alias }, { status: 201 });
  } catch (error) {
    if (error instanceof RegionRegistryError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    console.error("ATI PH calendar-region alias creation failed.", error);
    return Response.json(
      { error: "Calendar-region alias creation failed." },
      { status: 500 },
    );
  }
}
