import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

export async function GET() {
  const startedAt = performance.now();

  try {
    getServerEnv();
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "UP",
      service: "ati-ph",
      database: "UP",
      latencyMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    console.error("Readiness check failed", error);
    return NextResponse.json(
      { status: "DOWN", service: "ati-ph", database: "DOWN" },
      { status: 503 },
    );
  }
}
