"use client";

import {
  useEffect,
  useState,
} from "react";

import { mountedPath } from "@/config/app";

type ReconciliationItem = {
  attemptId: string;
  attemptNumber: number;
  provider: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: string | null;
  acceptedRecipients: unknown;
  rejectedRecipients: unknown;
  job: {
    id: string;
    status: string;
    scheduledAt: string;
  };
  holiday: {
    name: string;
    startDate: string;
    endDate: string;
  };
  client: {
    name: string;
    serviceTeamName: string;
  };
};

type QueueResponse = {
  count: number;
  attempts: ReconciliationItem[];
  error?: string;
};

type Action = "MARK_SENT" | "RETRY" | "FAIL";

async function loadDeliveryReconciliationQueue(): Promise<
  ReconciliationItem[]
> {
  const response = await fetch(
    mountedPath(
      "/api/notification-delivery/reconciliation?limit=50",
    ),
    { cache: "no-store" },
  );
  const payload =
    (await response.json()) as QueueResponse;

  if (!response.ok) {
    throw new Error(
      payload.error ??
        "Could not load delivery reconciliation queue.",
    );
  }

  return payload.attempts;
}

export function DeliveryOperations({
  canReconcile,
}: {
  canReconcile: boolean;
}) {
  const [items, setItems] =
    useState<ReconciliationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAttemptId, setBusyAttemptId] =
    useState<string>();
  const [notes, setNotes] =
    useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;

    void loadDeliveryReconciliationQueue()
      .then((attempts) => {
        if (!active) return;
        setItems(attempts);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(errorMessage(loadError));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function reconcile(
    attemptId: string,
    action: Action,
  ) {
    const note = notes[attemptId]?.trim() ?? "";
    if (note.length < 5) {
      setError(
        "Add a reconciliation note of at least 5 characters.",
      );
      return;
    }

    setBusyAttemptId(attemptId);
    setError(undefined);
    setNotice(undefined);

    try {
      const response = await fetch(
        mountedPath(
          `/api/notification-delivery/reconciliation/${attemptId}`,
        ),
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ action, note }),
        },
      );
      const payload =
        (await response.json()) as {
          error?: string;
        };
      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Could not reconcile delivery outcome.",
        );
      }

      setNotes((current) => {
        const next = { ...current };
        delete next[attemptId];
        return next;
      });
      const refreshedItems =
        await loadDeliveryReconciliationQueue();
      setItems(refreshedItems);
      setNotice(
        action === "MARK_SENT"
          ? "Outcome reconciled as delivered."
          : action === "RETRY"
            ? "Manual retry authorized and job returned to DUE."
            : "Outcome reconciled as failed.",
      );
    } catch (reconcileError) {
      setError(errorMessage(reconcileError));
    } finally {
      setBusyAttemptId(undefined);
    }
  }

  return (
    <section className="ati-card notification-planning">
      <div className="notification-registry__topbar">
        <div>
          <strong>Delivery reconciliation</strong>
          <p>
            OUTCOME_UNKNOWN attempts stay blocked until an authorized
            reviewer records an explicit resolution.
          </p>
        </div>
        <div className="notification-registry__meta">
          <strong>{items.length}</strong>
          <span>open outcomes</span>
        </div>
      </div>

      {notice ? (
        <p className="form-notice form-notice--success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="form-notice form-notice--error">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p>Loading delivery outcomes…</p>
      ) : items.length === 0 ? (
        <div className="notification-empty">
          <strong>No unresolved delivery outcomes</strong>
          <span>
            Partial, incomplete, and ambiguous SMTP results will appear
            here instead of being retried automatically.
          </span>
        </div>
      ) : (
        <div className="notification-occurrence-list">
          {items.map((item) => (
            <article
              className="notification-occurrence-card"
              key={item.attemptId}
            >
              <div>
                <strong>
                  {item.client.name} · {item.holiday.name}
                </strong>
                <span>
                  {item.client.serviceTeamName} · attempt {item.attemptNumber}
                  {item.provider ? ` · ${item.provider}` : ""}
                </span>
                <span>
                  {item.errorCode ?? "OUTCOME_UNKNOWN"}
                  {item.errorMessage
                    ? ` · ${item.errorMessage}`
                    : ""}
                </span>
              </div>

              {canReconcile ? (
                <div className="notification-search">
                  <label>
                    <span>Reconciliation note</span>
                    <input
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [item.attemptId]: event.target.value,
                        }))
                      }
                      placeholder="Evidence / operator decision"
                      type="text"
                      value={notes[item.attemptId] ?? ""}
                    />
                  </label>
                  <button
                    className="ati-btn ati-btn--secondary"
                    disabled={busyAttemptId === item.attemptId}
                    onClick={() =>
                      void reconcile(item.attemptId, "MARK_SENT")
                    }
                    type="button"
                  >
                    Mark delivered
                  </button>
                  <button
                    className="ati-btn ati-btn--secondary"
                    disabled={busyAttemptId === item.attemptId}
                    onClick={() =>
                      void reconcile(item.attemptId, "RETRY")
                    }
                    type="button"
                  >
                    Retry
                  </button>
                  <button
                    className="ati-btn ati-btn--subtle"
                    disabled={busyAttemptId === item.attemptId}
                    onClick={() =>
                      void reconcile(item.attemptId, "FAIL")
                    }
                    type="button"
                  >
                    Close failed
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}
