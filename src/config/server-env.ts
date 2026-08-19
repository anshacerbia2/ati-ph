import { z } from "zod";

const serverEnvSchema = z.object({
  PUBLIC_APP_URL: z.url(),
  OIDC_CALLBACK_URL: z.url().optional(),
  DATABASE_URL: z.string().min(1),
  KEYCLOAK_ISSUER: z.url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(28_800),
  ACCESS_TOKEN_REFRESH_SKEW_SECONDS: z.coerce
    .number()
    .int()
    .min(5)
    .max(300)
    .default(30),
  TRUST_ATI_ONE_PROXY: z.enum(["true", "false"]).default("false"),
  ATI_ONE_PROXY_SECRET: z.string().min(32).optional(),
  ATI_ONE_RETURN_URL: z.url().default("http://localhost:3000/"),
  ARTIFACT_STORAGE_DIR: z.string().min(1).default("./storage/artifacts"),
  IMPORT_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .min(1_048_576)
    .max(52_428_800)
    .default(10_485_760),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(5_000).default(60_000),
  NOTIFICATION_SCHEDULER_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = serverEnvSchema.parse(process.env);

    if (cachedEnv.TRUST_ATI_ONE_PROXY === "true" && !cachedEnv.ATI_ONE_PROXY_SECRET) {
      throw new Error(
        "ATI_ONE_PROXY_SECRET is required when TRUST_ATI_ONE_PROXY=true",
      );
    }
  }

  return cachedEnv;
}
