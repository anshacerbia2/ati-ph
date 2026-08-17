import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { updateContact } from "@/clients/client-config";
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
    params: Promise<{ clientId: string; contactId: string }>;
  },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.CLIENT_MANAGE);
  if (!access.ok) return access.response;

  try {
    const body = await readClientRoutingJson(request);
    const { clientId, contactId } = await params;
    const contact = await updateContact(
      clientId,
      contactId,
      body,
      access.session.user.id,
    );
    return Response.json({ contact });
  } catch (error) {
    return clientRoutingErrorResponse(error, "contact update");
  }
}
