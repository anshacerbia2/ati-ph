import { z } from "zod";

/**
 * Every environment variable ATI PH reads, declared once.
 *
 * ## Why this file is the only declaration
 *
 * Three modules parse environment values: this schema, `resolveEmailAutomaticDeliveryRelease`
 * and `evaluateProductionReadiness`. The latter two take an injected
 * `Record<string, string | undefined>` because they are pure and heavily tested, and
 * that is worth keeping — but each brought its own boolean rule, and they disagreed:
 * one throws on a value that is neither `true` nor `false`, the other silently reads
 * anything-but-`true` as false.
 *
 * Three variables that decide whether real email leaves the building —
 * `EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED`, `EMAIL_DELIVERY_KILL_SWITCH` and
 * `EMAIL_DELIVERY_KILL_SWITCH_PATH` — were read *only* by those modules and appeared
 * in no schema and no `.env.example`. There was no way to learn they existed by
 * reading configuration, which is the failure this file now closes.
 *
 * They are declared here, so every value is validated at the boundary before any
 * downstream module sees it. Once `z.enum(["true", "false"])` has rejected everything
 * else at boot, the disagreement between those two parsers is unreachable rather than
 * merely unlikely. The schema is the source of truth for *what exists and what is
 * legal*; the evaluators keep deciding *what it means*.
 *
 * ## Profiles
 *
 * A deployment does not tune these one at a time. It picks a profile, and each
 * profile is a complete file with every value written out:
 *
 * ```text
 * .env.local.example       local development  - SMTP connectivity test, worker off
 * .env.test.example        shared test        - controlled pilot, worker on, no automatic send
 * .env.production.example  production         - automatic SMTP, worker on
 * ```
 *
 * `superRefine` below refuses combinations that cannot be meant, so a file edited
 * into an incoherent state fails at boot with the contradiction named — rather than
 * starting and quietly doing something else. See `docs/ENVIRONMENT-PROFILES.md`.
 */
export const serverEnvSchema = z
  .object({
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
    /*
     * Required, with no default.
     *
     * It was `http://localhost:3000/`, which is a deployment fact written into
     * source: a production process that forgot the variable would send people to a
     * loopback address on their own machine and look like a broken link rather than
     * a missing setting. Every profile states it.
     */
    ATI_ONE_RETURN_URL: z.url(),
    ARTIFACT_STORAGE_DIR: z.string().min(1).default("./storage/artifacts"),
    IMPORT_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .min(1_048_576)
      .max(52_428_800)
      .default(10_485_760),
    /*
     * Whether the worker process may run at all.
     *
     * "Worker disabled" used to be expressed by not typing `npm run worker`, which is
     * not a configuration state — nothing in any file said it, so a developer could
     * only find out by looking at what was running. On a local machine that is how a
     * scheduler quietly claims jobs nobody meant to touch.
     *
     * `false` makes the process refuse to start and say so. It does not stop the web
     * application, which never claims or delivers anything.
     */
    NOTIFICATION_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
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
    NOTIFICATION_TRUSTED_AUTOMATION_ENABLED: z
      .enum(["true", "false"])
      .default("false"),
    NOTIFICATION_AUTOMATION_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50),
    NOTIFICATION_AUTOMATION_HORIZON_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(730)
      .default(400),
    NOTIFICATION_SCHEDULER_LAG_THRESHOLD_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86_400)
      .default(300),
    NOTIFICATION_RETENTION_ENABLED: z.enum(["true", "false"]).default("false"),
    NOTIFICATION_OPERATIONAL_ALERT_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3650)
      .default(90),
    NOTIFICATION_RETENTION_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100),
    EMAIL_DELIVERY_MODE: z
      .enum(["DISABLED", "STREAM", "SMTP"])
      .default("DISABLED"),
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
    EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED: z
      .enum(["true", "false"])
      .default("false"),
    /*
     * The two gates in front of automatic SMTP execution, and the file form of the
     * second one. Declared here for the reason in this file's header: they decide
     * whether real email leaves the building and were previously invisible to
     * configuration.
     *
     * `resolveEmailAutomaticDeliveryRelease` still reads them from its own injected
     * record and applies these same defaults. That duplication is deliberate — it
     * keeps the release decision pure and independently testable — and it is now safe,
     * because nothing illegal can reach it.
     *
     * `EMAIL_DELIVERY_KILL_SWITCH` defaults to **true**. Every other flag here
     * defaults to the closed position by being false; this one closes by being true,
     * so the default is stated rather than left to be inferred from the name.
     */
    EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: z
      .enum(["true", "false"])
      .default("false"),
    EMAIL_DELIVERY_KILL_SWITCH: z.enum(["true", "false"]).default("true"),
    EMAIL_DELIVERY_KILL_SWITCH_PATH: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_DELIVERY_MODE !== "DISABLED" && !env.EMAIL_FROM_ADDRESS) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_FROM_ADDRESS"],
        message:
          "EMAIL_FROM_ADDRESS is required when email delivery is enabled",
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
        message:
          "EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD must be configured together",
      });
    }
    if (
      env.EMAIL_SMTP_TEST_ENABLED === "true" &&
      !env.EMAIL_SMTP_TEST_RECIPIENT
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_SMTP_TEST_RECIPIENT"],
        message:
          "EMAIL_SMTP_TEST_RECIPIENT is required when EMAIL_SMTP_TEST_ENABLED=true",
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

    /*
     * Profile coherence.
     *
     * Each rule below rejects a file that cannot mean what it says. They exist because
     * every one of these combinations *starts* — and then behaves as though a flag the
     * operator set were not set, which is the hardest kind of configuration bug to
     * see: nothing fails, and the log agrees with neither reading.
     *
     * They are boot-time refusals rather than warnings on purpose. A warning about
     * email delivery is a line in a log nobody is watching at the moment it matters.
     */
    const automaticDelivery =
      env.EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED === "true";
    const manualTooling =
      env.EMAIL_SMTP_TEST_ENABLED === "true" ||
      env.EMAIL_SMTP_PILOT_ENABLED === "true";

    if (automaticDelivery && env.EMAIL_DELIVERY_MODE !== "SMTP") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED"],
        message:
          `EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true has no effect with EMAIL_DELIVERY_MODE=${env.EMAIL_DELIVERY_MODE}. ` +
          "Automatic delivery only executes on the SMTP transport; a profile that arms it against another mode reads as enabled and sends nothing.",
      });
    }

    if (
      env.EMAIL_SMTP_TEST_ENABLED === "true" &&
      env.EMAIL_SMTP_PILOT_ENABLED === "true"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_SMTP_PILOT_ENABLED"],
        message:
          "EMAIL_SMTP_TEST_ENABLED and EMAIL_SMTP_PILOT_ENABLED cannot both be true. " +
          "They are two different validations with two different recipients, and a profile has to say which one it is.",
      });
    }

    if (automaticDelivery && manualTooling) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED"],
        message:
          "Automatic SMTP delivery cannot be combined with the manual test or pilot commands. " +
          "A profile is either validating delivery by hand or delegating it to the worker; enabling both makes it impossible to say which path sent a given message.",
      });
    }

    if (automaticDelivery && env.NOTIFICATION_WORKER_ENABLED !== "true") {
      ctx.addIssue({
        code: "custom",
        path: ["NOTIFICATION_WORKER_ENABLED"],
        message:
          "EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true requires NOTIFICATION_WORKER_ENABLED=true. " +
          "Automatic delivery is executed by the worker and by nothing else, so arming it while the worker is disabled describes an intent the deployment cannot carry out.",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = serverEnvSchema.parse(process.env);

    if (
      cachedEnv.TRUST_ATI_ONE_PROXY === "true" &&
      !cachedEnv.ATI_ONE_PROXY_SECRET
    ) {
      throw new Error(
        "ATI_ONE_PROXY_SECRET is required when TRUST_ATI_ONE_PROXY=true",
      );
    }
  }

  return cachedEnv;
}
