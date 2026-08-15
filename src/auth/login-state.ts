import "server-only";

import { z } from "zod";

import { openPayload, sealPayload } from "@/auth/crypto";
import { getServerEnv } from "@/lib/env";

const loginStateSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(1),
  returnTo: z.string().startsWith("/"),
  expiresAt: z.number().int(),
});

export type LoginState = z.infer<typeof loginStateSchema>;

export async function sealLoginState(value: LoginState): Promise<string> {
  return sealPayload(value, getServerEnv().SESSION_SECRET);
}

export async function openLoginState(value: string): Promise<LoginState> {
  const state = await openPayload(
    value,
    getServerEnv().SESSION_SECRET,
    loginStateSchema,
  );

  if (state.expiresAt <= Date.now()) {
    throw new Error("Login state has expired");
  }

  return state;
}
