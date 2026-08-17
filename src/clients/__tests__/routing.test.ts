import { describe, expect, it } from "vitest";

import {
  isSubscriptionEffectiveOn,
  normalizeClientName,
  normalizeContactEmail,
  normalizeServiceTeamName,
  validateEffectiveWindow,
} from "@/clients/routing";

describe("client routing foundation", () => {
  it("normalizes client and service-team identity deterministically", () => {
    expect(normalizeClientName("  Flight Centre / AU  ")).toBe(
      "flight centre au",
    );
    expect(normalizeServiceTeamName(" Ticketing - Team A ")).toBe(
      "ticketing team a",
    );
  });

  it("normalizes contact email for client-scoped uniqueness", () => {
    expect(normalizeContactEmail(" Ops.Team@Example.COM ")).toBe(
      "ops.team@example.com",
    );
  });

  it("rejects an inverted effective window", () => {
    expect(
      validateEffectiveWindow({
        effectiveFrom: "2027-12-31",
        effectiveTo: "2027-01-01",
      }),
    ).toEqual({
      ok: false,
      reason: "effectiveTo must be on or after effectiveFrom.",
    });
  });

  it("matches only active subscriptions inside the effective window", () => {
    const subscription = {
      isActive: true,
      effectiveFrom: "2027-01-01",
      effectiveTo: "2027-12-31",
    };

    expect(isSubscriptionEffectiveOn(subscription, "2027-06-01")).toBe(true);
    expect(isSubscriptionEffectiveOn(subscription, "2026-12-31")).toBe(false);
    expect(isSubscriptionEffectiveOn(subscription, "2028-01-01")).toBe(false);
    expect(
      isSubscriptionEffectiveOn(
        { ...subscription, isActive: false },
        "2027-06-01",
      ),
    ).toBe(false);
  });

  it("supports open-ended subscription windows", () => {
    expect(
      isSubscriptionEffectiveOn(
        {
          isActive: true,
          effectiveFrom: null,
          effectiveTo: null,
        },
        "2027-08-17",
      ),
    ).toBe(true);
  });

  it("fails closed for invalid effective boundaries", () => {
    expect(
      validateEffectiveWindow({
        effectiveFrom: "invalid",
        effectiveTo: null,
      }),
    ).toEqual({
      ok: false,
      reason: "effectiveFrom must be a valid date.",
    });

    expect(
      isSubscriptionEffectiveOn(
        {
          isActive: true,
          effectiveFrom: "invalid",
          effectiveTo: null,
        },
        "2027-06-01",
      ),
    ).toBe(false);
  });
});
