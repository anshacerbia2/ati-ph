import "server-only";

import { ClientRoutingError } from "@/clients/client-config";

export async function readClientRoutingJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ClientRoutingError(
      "INVALID_INPUT",
      "Expected a JSON request body.",
      400,
    );
  }
}

export function clientRoutingErrorResponse(
  error: unknown,
  operation: string,
): Response {
  if (error instanceof ClientRoutingError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  console.error(`ATI PH client-routing ${operation} failed.`, error);
  return Response.json(
    { error: `Client-routing ${operation} failed.` },
    { status: 500 },
  );
}
