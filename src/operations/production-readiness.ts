export type ProductionReadinessCheck = {
  code: string;
  ok: boolean;
  message: string;
};

export type ProductionReadinessReport = {
  productionMode: boolean;
  applicationReady: boolean;
  externalDeliveryReady: boolean;
  checks: ProductionReadinessCheck[];
  blockers: string[];
  externalDeliveryBlockers: string[];
};

export function evaluateProductionReadiness(
  env: Readonly<Record<string, string | undefined>>,
): ProductionReadinessReport {
  const productionMode =
    normalized(env.NODE_ENV) === "production";

  const checks: ProductionReadinessCheck[] = [];

  checks.push(
    check(
      "PUBLIC_APP_URL",
      !productionMode ||
        isHttpsUrl(env.PUBLIC_APP_URL),
      productionMode
        ? "PUBLIC_APP_URL must use HTTPS in production."
        : "HTTPS production URL check is not required outside production.",
    ),
  );

  checks.push(
    check(
      "OIDC_CALLBACK_URL",
      !productionMode ||
        isHttpsUrl(env.OIDC_CALLBACK_URL),
      productionMode
        ? "OIDC_CALLBACK_URL must use HTTPS in production."
        : "HTTPS callback check is not required outside production.",
    ),
  );

  checks.push(
    check(
      "TRUST_ATI_ONE_PROXY",
      !productionMode ||
        normalized(
          env.TRUST_ATI_ONE_PROXY,
        ) === "true",
      productionMode
        ? "TRUST_ATI_ONE_PROXY must be true in production."
        : "ATI One proxy trust is not required outside production.",
    ),
  );

  for (const key of [
    "KEYCLOAK_CLIENT_SECRET",
    "SESSION_SECRET",
    "ATI_ONE_PROXY_SECRET",
  ] as const) {
    checks.push(
      check(
        key,
        !productionMode ||
          isNonPlaceholderSecret(env[key]),
        productionMode
          ? `${key} must be a non-placeholder production secret.`
          : `${key} production-secret check is not required outside production.`,
      ),
    );
  }

  checks.push(
    check(
      "EMAIL_SMTP_TEST_ENABLED",
      !productionMode ||
        normalized(
          env.EMAIL_SMTP_TEST_ENABLED,
        ) !== "true",
      "Manual SMTP connectivity test must be disabled in production.",
    ),
  );

  checks.push(
    check(
      "EMAIL_SMTP_PILOT_ENABLED",
      !productionMode ||
        normalized(
          env.EMAIL_SMTP_PILOT_ENABLED,
        ) !== "true",
      "Controlled SMTP pilot mode must be disabled in production.",
    ),
  );

  const externalDeliveryRequested =
    normalized(env.EMAIL_DELIVERY_MODE) ===
      "smtp" &&
    normalized(
      env.EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED,
    ) === "true" &&
    normalized(
      env.EMAIL_DELIVERY_KILL_SWITCH,
    ) === "false";

  const productionReleaseApproved =
    normalized(
      env.EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED,
    ) === "true";

  checks.push(
    check(
      "EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED",
      !productionMode ||
        !externalDeliveryRequested ||
        productionReleaseApproved,
      "Production automatic SMTP requires explicit production release approval.",
    ),
  );

  const applicationCheckCodes = new Set([
    "PUBLIC_APP_URL",
    "OIDC_CALLBACK_URL",
    "TRUST_ATI_ONE_PROXY",
    "KEYCLOAK_CLIENT_SECRET",
    "SESSION_SECRET",
    "ATI_ONE_PROXY_SECRET",
    "EMAIL_SMTP_TEST_ENABLED",
    "EMAIL_SMTP_PILOT_ENABLED",
  ]);

  const blockers = checks
    .filter(
      (item) =>
        applicationCheckCodes.has(item.code) &&
        !item.ok,
    )
    .map((item) => item.message);

  const externalDeliveryBlockers =
    productionMode &&
    externalDeliveryRequested &&
    !productionReleaseApproved
      ? [
          "Production automatic SMTP release approval is not recorded.",
        ]
      : [];

  return {
    productionMode,
    applicationReady:
      blockers.length === 0,
    externalDeliveryReady:
      externalDeliveryBlockers.length === 0,
    checks,
    blockers,
    externalDeliveryBlockers,
  };
}

function check(
  code: string,
  ok: boolean,
  message: string,
): ProductionReadinessCheck {
  return { code, ok, message };
}

function normalized(
  value: string | undefined,
): string {
  return value?.trim().toLowerCase() ?? "";
}

function isHttpsUrl(
  value: string | undefined,
): boolean {
  if (!value) return false;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isNonPlaceholderSecret(
  value: string | undefined,
): boolean {
  const candidate = value?.trim() ?? "";
  if (candidate.length < 32) return false;

  return !/(replace-with|changeme|example|placeholder)/i.test(
    candidate,
  );
}
