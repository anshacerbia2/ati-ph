import { existsSync } from "node:fs";

export type EmailAutomaticDeliveryRelease = {
  smtpAutomaticDeliveryEnabled: boolean;
  killSwitchActive: boolean;
  killSwitchPath: string | null;
  productionReleaseRequired: boolean;
  productionReleaseApproved: boolean;
  canExecuteSmtpAutomatically: boolean;
  reasons: string[];
};

type FileExists = (path: string) => boolean;

export function resolveEmailAutomaticDeliveryRelease(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fileExists: FileExists = existsSync,
): EmailAutomaticDeliveryRelease {
  const smtpAutomaticDeliveryEnabled = readBoolean(
    env.EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED,
    false,
    "EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED",
  );
  const staticKillSwitch = readBoolean(
    env.EMAIL_DELIVERY_KILL_SWITCH,
    true,
    "EMAIL_DELIVERY_KILL_SWITCH",
  );
  const killSwitchPath = normalizeOptional(
    env.EMAIL_DELIVERY_KILL_SWITCH_PATH,
  );
  const fileKillSwitch =
    killSwitchPath !== null && fileExists(killSwitchPath);
  const killSwitchActive =
    staticKillSwitch || fileKillSwitch;
  const productionReleaseRequired =
    env.NODE_ENV?.trim().toLowerCase() ===
    "production";
  const productionReleaseApproved =
    readBoolean(
      env.EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED,
      false,
      "EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED",
    );
  const reasons: string[] = [];

  if (!smtpAutomaticDeliveryEnabled) {
    reasons.push(
      "EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED is not explicitly true",
    );
  }
  if (staticKillSwitch) {
    reasons.push(
      "EMAIL_DELIVERY_KILL_SWITCH is active",
    );
  }
  if (fileKillSwitch) {
    reasons.push(
      `kill-switch file exists at ${killSwitchPath}`,
    );
  }
  if (
    productionReleaseRequired &&
    !productionReleaseApproved
  ) {
    reasons.push(
      "EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED is not explicitly true in production",
    );
  }

  return {
    smtpAutomaticDeliveryEnabled,
    killSwitchActive,
    killSwitchPath,
    productionReleaseRequired,
    productionReleaseApproved,
    canExecuteSmtpAutomatically:
      smtpAutomaticDeliveryEnabled &&
      !killSwitchActive &&
      (!productionReleaseRequired ||
        productionReleaseApproved),
    reasons,
  };
}

function readBoolean(
  value: string | undefined,
  defaultValue: boolean,
  name: string,
): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function normalizeOptional(
  value: string | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
