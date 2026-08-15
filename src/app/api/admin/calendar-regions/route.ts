import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  createCalendarRegion,
  listCalendarRegions,
  RegionRegistryError,
} from "@/holiday/region-registry";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.CALENDAR_REGION_READ);
  if (!access.ok) {
    return access.response;
  }

  const regions = await listCalendarRegions();
  return Response.json({ regions });
}

export async function POST(request: Request): Promise<Response> {
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

  try {
    const region = await createCalendarRegion(body, access.session.user.id);
    return Response.json({ region }, { status: 201 });
  } catch (error) {
    return registryErrorResponse(error);
  }
}

function registryErrorResponse(error: unknown): Response {
  if (error instanceof RegionRegistryError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  console.error("ATI PH calendar-region administration failed.", error);
  return Response.json(
    { error: "Calendar-region administration failed." },
    { status: 500 },
  );
}
