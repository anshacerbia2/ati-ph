import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  createClient,
  listClientRoutingConfiguration,
} from "@/clients/client-config";
import {
  clientRoutingErrorResponse,
  readClientRoutingJson,
} from "@/clients/http";
import { parseClientListQuery } from "@/clients/list-query";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.CLIENT_READ);
  if (!access.ok) return access.response;

  try {
    const searchParams = new URL(request.url).searchParams;
    const query = parseClientListQuery({
      search: searchParams.get("search"),
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });

    return Response.json(await listClientRoutingConfiguration(query));
  } catch (error) {
    return clientRoutingErrorResponse(error, "load");
  }
}

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.CLIENT_MANAGE);
  if (!access.ok) return access.response;

  try {
    const body = await readClientRoutingJson(request);
    const client = await createClient(body, access.session.user.id);
    return Response.json({ client }, { status: 201 });
  } catch (error) {
    return clientRoutingErrorResponse(error, "client create");
  }
}
