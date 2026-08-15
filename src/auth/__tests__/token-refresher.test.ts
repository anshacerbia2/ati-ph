import { describe, expect, it } from "vitest";

import {
  accessTokenNeedsRefresh,
  TokenRefreshCoordinator,
} from "@/auth/token-refresher";

describe("accessTokenNeedsRefresh", () => {
  it("refreshes only when the token enters the configured skew", () => {
    expect(accessTokenNeedsRefresh(1_100, 1_000, 30)).toBe(false);
    expect(accessTokenNeedsRefresh(1_030, 1_000, 30)).toBe(true);
    expect(accessTokenNeedsRefresh(undefined, 1_000, 30)).toBe(true);
  });
});

describe("TokenRefreshCoordinator", () => {
  it("coalesces concurrent refreshes for one session", async () => {
    const coordinator = new TokenRefreshCoordinator();
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const exchange = async () => {
      calls += 1;
      await gate;
      return "refreshed" as const;
    };

    const first = coordinator.refresh("session-a", exchange);
    const second = coordinator.refresh("session-a", exchange);
    release?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "refreshed",
      "refreshed",
    ]);
    expect(calls).toBe(1);
  });

  it("reuses a recent result for sequential requests with the old state", async () => {
    const coordinator = new TokenRefreshCoordinator();
    let calls = 0;
    const exchange = async () => {
      calls += 1;
      return "refreshed" as const;
    };

    await coordinator.refresh("session-a", exchange);
    await coordinator.refresh("session-a", exchange);
    expect(calls).toBe(1);
  });

  it("does not mix different sessions", async () => {
    const coordinator = new TokenRefreshCoordinator();
    let calls = 0;
    const exchange = async () => {
      calls += 1;
      return "refreshed" as const;
    };

    await Promise.all([
      coordinator.refresh("session-a", exchange),
      coordinator.refresh("session-b", exchange),
    ]);
    expect(calls).toBe(2);
  });

  it("fails closed when the exchange throws", async () => {
    const coordinator = new TokenRefreshCoordinator();
    await expect(
      coordinator.refresh("session-a", async () => {
        throw new Error("Keycloak unavailable");
      }),
    ).resolves.toBe("revoked");
  });
});
