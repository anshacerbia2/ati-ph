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
  ATI_ONE_RETURN_URL: z.url().default("http://localhost:3005/"),
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
  NOTIFICATION_DELIVERY_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25),
  NOTIFICATION_DELIVERY_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(120),
  EMAIL_DELIVERY_MODE: z.enum(["DISABLED", "STREAM", "SMTP"]).default("DISABLED"),
  EMAIL_SENDER_IDENTITY_CODE: z.string().min(1).default("PH_NOTIFICATION"),
  EMAIL_FROM_ADDRESS: z.email().optional(),
  EMAIL_FROM_NAME: z.string().min(1).default("ATI Business Group"),
  EMAIL_REPLY_TO: z.email().optional(),
  EMAIL_TRANSPORT_CODE: z.string().min(1).default("ATI_PRIMARY"),
  EMAIL_SMTP_HOST: z.string().min(1).optional(),
  EMAIL_SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  EMAIL_SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  EMAIL_SMTP_REQUIRE_TLS: z.enum(["true", "false"]).default("true"),
  EMAIL_SMTP_USER: z.string().min(1).optional(),
  EMAIL_SMTP_PASSWORD: z.string().min(1).optional(),
  EMAIL_SMTP_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(10_000),
  EMAIL_SMTP_TEST_ENABLED: z.enum(["true", "false"]).default("false"),
  EMAIL_SMTP_TEST_RECIPIENT: z.email().optional(),
  EMAIL_SMTP_PILOT_ENABLED: z.enum(["true", "false"]).default("false"),
  EMAIL_SMTP_PILOT_RECIPIENT: z.email().optional(),
}).superRefine((env, ctx) => {
  if (env.EMAIL_DELIVERY_MODE !== "DISABLED" && !env.EMAIL_FROM_ADDRESS) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_FROM_ADDRESS"],
      message: "EMAIL_FROM_ADDRESS is required when email delivery is enabled",
    });
  }
  if (env.EMAIL_DELIVERY_MODE === "SMTP" && !env.EMAIL_SMTP_HOST) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_SMTP_HOST"],
      message: "EMAIL_SMTP_HOST is required when EMAIL_DELIVERY_MODE=SMTP",
    });
  }
  if (Boolean(env.EMAIL_SMTP_USER) !== Boolean(env.EMAIL_SMTP_PASSWORD)) {
    ctx.addIssue({
      code: "custom",
      path: [env.EMAIL_SMTP_USER ? "EMAIL_SMTP_PASSWORD" : "EMAIL_SMTP_USER"],
      message: "EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD must be configured together",
    });
  }
  if (env.EMAIL_SMTP_TEST_ENABLED === "true" && !env.EMAIL_SMTP_TEST_RECIPIENT) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_SMTP_TEST_RECIPIENT"],
      message: "EMAIL_SMTP_TEST_RECIPIENT is required when EMAIL_SMTP_TEST_ENABLED=true",
    });
  }
  if (
    env.EMAIL_SMTP_PILOT_ENABLED === "true" &&
    !env.EMAIL_SMTP_PILOT_RECIPIENT
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_SMTP_PILOT_RECIPIENT"],
      message:
        "EMAIL_SMTP_PILOT_RECIPIENT is required when EMAIL_SMTP_PILOT_ENABLED=true",
    });
  }
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
