import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  PROXY_PROOF_HEADER,
} from "@/config/app";

function validProxyProof(request: NextRequest): boolean {
  if (process.env.TRUST_ATI_ONE_PROXY !== "true") {
    return true;
  }

  const expected = process.env.ATI_ONE_PROXY_SECRET;
  const received = request.headers.get(PROXY_PROOF_HEADER);

  if (!expected || !received) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function proxy(request: NextRequest) {
  if (!validProxyProof(request)) {
    return NextResponse.json(
      { error: "Direct origin access is not allowed." },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
