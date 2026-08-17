import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { updateSubscription } from "@/clients/client-config";
import {
  clientRoutingErrorResponse,
  readClientRoutingJson,
} from "@/clients/http";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      clientId: string;
      teamId: string;
      subscriptionId: string;
    }>;
  },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.CLIENT_MANAGE);
  if (!access.ok) return access.response;

  try {
    const body = await readClientRoutingJson(request);
    const { clientId, teamId, subscriptionId } = await params;
    const subscription = await updateSubscription(
      clientId,
      teamId,
      subscriptionId,
      body,
      access.session.user.id,
    );
    return Response.json({ subscription });
  } catch (error) {
    return clientRoutingErrorResponse(error, "subscription update");
  }
}
