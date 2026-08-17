import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { updateSubscriptionRecipient } from "@/clients/client-config";
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
      contactId: string;
    }>;
  },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.CLIENT_MANAGE);
  if (!access.ok) return access.response;

  try {
    const body = await readClientRoutingJson(request);
    const {
      clientId,
      teamId,
      subscriptionId,
      contactId,
    } = await params;
    const recipient = await updateSubscriptionRecipient(
      clientId,
      teamId,
      subscriptionId,
      contactId,
      body,
      access.session.user.id,
    );
    return Response.json({ recipient });
  } catch (error) {
    return clientRoutingErrorResponse(error, "recipient update");
  }
}
