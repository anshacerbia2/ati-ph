import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveEmailAutomaticDeliveryRelease,
} from "@/email/automatic-delivery-release";

describe("SMTP automatic delivery release control", () => {
  it("fails closed by default", () => {
    expect(
      resolveEmailAutomaticDeliveryRelease({}, () => false),
    ).toMatchObject({
      smtpAutomaticDeliveryEnabled: false,
      killSwitchActive: true,
      canExecuteSmtpAutomatically: false,
    });
  });

  it("requires both explicit enablement and an inactive kill switch", () => {
    expect(
      resolveEmailAutomaticDeliveryRelease(
        {
          EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "true",
          EMAIL_DELIVERY_KILL_SWITCH: "false",
        },
        () => false,
      ),
    ).toMatchObject({
      smtpAutomaticDeliveryEnabled: true,
      killSwitchActive: false,
      canExecuteSmtpAutomatically: true,
    });
  });

  it("blocks delivery when the static kill switch is active", () => {
    expect(
      resolveEmailAutomaticDeliveryRelease(
        {
          EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "true",
          EMAIL_DELIVERY_KILL_SWITCH: "true",
        },
        () => false,
      ).canExecuteSmtpAutomatically,
    ).toBe(false);
  });

  it("blocks delivery when the runtime kill-switch file exists", () => {
    const release = resolveEmailAutomaticDeliveryRelease(
      {
        EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "true",
        EMAIL_DELIVERY_KILL_SWITCH: "false",
        EMAIL_DELIVERY_KILL_SWITCH_PATH: ".runtime/email-delivery.kill",
      },
      (path) => path === ".runtime/email-delivery.kill",
    );

    expect(release.killSwitchActive).toBe(true);
    expect(release.canExecuteSmtpAutomatically).toBe(false);
  });

  it("rejects ambiguous boolean values", () => {
    expect(() =>
      resolveEmailAutomaticDeliveryRelease(
        {
          EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "yes",
        },
        () => false,
      ),
    ).toThrow(/must be true or false/i);
  });
});
