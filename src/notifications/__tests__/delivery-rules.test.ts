import { describe, expect, it } from "vitest";

import {
  notificationDeliveryClaimEligibility,
} from "@/notifications/delivery-rules";

describe("notification delivery claim eligibility", () => {
  it("allows only DUE jobs explicitly permitted for automatic send", () => {
    expect(
      notificationDeliveryClaimEligibility({
        status: "DUE",
        automaticSendAllowed: true,
      }),
    ).toEqual({ ok: true });
  });

  it("blocks DUE jobs when automatic send is disabled", () => {
    expect(
      notificationDeliveryClaimEligibility({
        status: "DUE",
        automaticSendAllowed: false,
      }),
    ).toEqual({
      ok: false,
      reasons: ["AUTOMATIC_SEND_NOT_ALLOWED"],
    });
  });

  it("blocks jobs that have not reached DUE", () => {
    expect(
      notificationDeliveryClaimEligibility({
        status: "PLANNED",
        automaticSendAllowed: true,
      }),
    ).toEqual({
      ok: false,
      reasons: ["JOB_NOT_DUE"],
    });
  });
});
