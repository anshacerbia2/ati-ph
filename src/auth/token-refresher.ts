export type RefreshOutcome = "refreshed" | "revoked" | "superseded";

export function accessTokenNeedsRefresh(
  expiresAt: number | undefined,
  nowSeconds: number,
  skewSeconds: number,
): boolean {
  return expiresAt === undefined || nowSeconds >= expiresAt - skewSeconds;
}

export class TokenRefreshCoordinator {
  private static readonly GRACE_MS = 30_000;
  private static readonly MAX_ENTRIES = 5_000;

  private readonly inFlight = new Map<string, Promise<RefreshOutcome>>();
  private readonly recent = new Map<
    string,
    { result: RefreshOutcome; at: number }
  >();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async refresh(
    sessionId: string,
    exchange: () => Promise<RefreshOutcome>,
  ): Promise<RefreshOutcome> {
    const settled = this.recent.get(sessionId);
    if (settled && this.now() - settled.at < TokenRefreshCoordinator.GRACE_MS) {
      return settled.result;
    }

    const pending = this.inFlight.get(sessionId);
    if (pending) {
      return pending;
    }

    const attempt = exchange()
      .then((result) => {
        this.remember(sessionId, result);
        return result;
      })
      .catch(() => {
        this.remember(sessionId, "revoked");
        return "revoked" as const;
      })
      .finally(() => {
        this.inFlight.delete(sessionId);
      });

    this.inFlight.set(sessionId, attempt);
    return attempt;
  }

  private remember(sessionId: string, result: RefreshOutcome): void {
    this.prune();
    if (this.recent.size >= TokenRefreshCoordinator.MAX_ENTRIES) {
      this.recent.clear();
    }
    this.recent.set(sessionId, { result, at: this.now() });
  }

  private prune(): void {
    const cutoff = this.now() - TokenRefreshCoordinator.GRACE_MS;
    for (const [sessionId, entry] of this.recent) {
      if (entry.at < cutoff) {
        this.recent.delete(sessionId);
      }
    }
  }
}
