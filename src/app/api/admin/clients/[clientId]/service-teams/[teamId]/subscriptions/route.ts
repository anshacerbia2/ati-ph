import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { createSubscription } from "@/clients/client-config";
import {
  clientRoutingErrorResponse,
  readClientRoutingJson,
} from "@/clients/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ clientId: string; teamId: string }>;
  },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.CLIENT_MANAGE);
  if (!access.ok) return access.response;

  try {
    const body = await readClientRoutingJson(request);
    const { clientId, teamId } = await params;
    const subscription = await createSubscription(
      clientId,
      teamId,
      body,
      access.session.user.id,
    );
    return Response.json({ subscription }, { status: 201 });
  } catch (error) {
    return clientRoutingErrorResponse(error, "subscription create");
  }
}
