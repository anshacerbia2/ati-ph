import "server-only";

import { createHash } from "node:crypto";
import { CompactEncrypt, compactDecrypt } from "jose";
import { z } from "zod";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function keyFromSecret(secret: string): Uint8Array {
  return createHash("sha256").update(secret).digest();
}

export async function sealPayload<T>(payload: T, secret: string): Promise<string> {
  return new CompactEncrypt(encoder.encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(keyFromSecret(secret));
}

export async function openPayload<T>(
  value: string,
  secret: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const { plaintext } = await compactDecrypt(value, keyFromSecret(secret));
  return schema.parse(JSON.parse(decoder.decode(plaintext)));
}
