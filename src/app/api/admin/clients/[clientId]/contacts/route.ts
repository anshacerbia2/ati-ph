import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { createContact } from "@/clients/client-config";
import {
  clientRoutingErrorResponse,
  readClientRoutingJson,
} from "@/clients/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.CLIENT_MANAGE);
  if (!access.ok) return access.response;

  try {
    const body = await readClientRoutingJson(request);
    const { clientId } = await params;
    const contact = await createContact(
      clientId,
      body,
      access.session.user.id,
    );
    return Response.json({ contact }, { status: 201 });
  } catch (error) {
    return clientRoutingErrorResponse(error, "contact create");
  }
}
