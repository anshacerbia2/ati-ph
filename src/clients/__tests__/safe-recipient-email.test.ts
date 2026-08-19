import { describe, expect, it } from "vitest";

import {
  SAFE_TEST_RECIPIENT_DOMAIN,
  isSafeTestRecipientEmail,
} from "@/clients/routing";

describe("safe test recipient email boundary", () => {
  it("accepts only the reserved dummy.test recipient domain", () => {
    expect(SAFE_TEST_RECIPIENT_DOMAIN).toBe("dummy.test");
    expect(isSafeTestRecipientEmail("pic@dummy.test")).toBe(true);
    expect(isSafeTestRecipientEmail(" PIC@DUMMY.TEST ")).toBe(true);
    expect(isSafeTestRecipientEmail("pic@dummy.com")).toBe(false);
    expect(isSafeTestRecipientEmail("pic@company.com")).toBe(false);
    expect(isSafeTestRecipientEmail("pic@dummy.test.evil.com")).toBe(false);
  });
});
