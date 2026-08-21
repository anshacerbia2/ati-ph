"use client";

import {
  useEffect,
  useState,
} from "react";

import { AlertHistory } from "@/components/ph-dashboard/AlertHistory";
import { mountedPath } from "@/config/app";

type WorkerHeartbeatState =
  | "DISABLED"
  | "NEVER_RUN"
  | "HEALTHY"
  | "LATE";

const HEARTBEAT_LABEL: Record<
  WorkerHeartbeatState,
  string
> = {
  DISABLED: "Disabled",
  NEVER_RUN: "Never run",
  HEALTHY: "Healthy",
  LATE: "Late",
};

function heartbeatClassName(
  state: WorkerHeartbeatState,
): string {
  const base = "notification-heartbeat";
  return state === "LATE" || state === "NEVER_RUN"
    ? `${base} ${base}--bad`
    : state === "DISABLED"
      ? `${base} ${base}--muted`
      : `${base} ${base}--ok`;
}

type OperationsOverview = {
  automation: {
    trustedAutomationEnabled: boolean;
    smtpAutomaticDeliveryEnabled: boolean;
    smtpKillSwitchActive: boolean;
    smtpCanExecuteAutomatically: boolean;
  };
  worker: {
    lastCycleStartedAt: string | null;
    lastCycleCompletedAt: string | null;
    lastSuccessfulAt: string | null;
    lastError: string | null;
    lastPlanningScanned: number;
    lastPlanningReady: number;
    lastPlanningCommitted: number;
    lastPlanningBlocked: number;
    lastDuePromoted: number;
    lastDeliveryClaims: number;
    lastOpenAlertCount: number;
  } | null;
  workerHeartbeat: {
    state: WorkerHeartbeatState;
    summary: string;
    ageMs: number | null;
    maximumAgeMs: number;
    lastSuccessfulAt: string | null;
  };
  jobs: Record<string, number>;
  alerts: {
    openCount: number;
    byType: Record<string, number>;
    items: Array<{
      id: string;
      type: string;
      severity: string;
      summary: string;
      firstDetectedAt: string;
      lastDetectedAt: string;
    }>;
  };
  reconciliationOpenCount: number;
  error?: string;
};

async function loadOperationsOverview(): Promise<
  OperationsOverview
> {
  const response = await fetch(
    mountedPath(
      "/api/notification-operations",
    ),
    { cache: "no-store" },
  );
  const payload =
    (await response.json()) as OperationsOverview;

  if (!response.ok) {
    throw new Error(
      payload.error ??
        "Could not load notification operations.",
    );
  }

  return payload;
}

export function TrustedAutomationOperations() {
  const [overview, setOverview] =
    useState<OperationsOverview>();
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string>();

  useEffect(() => {
    let active = true;

    void loadOperationsOverview()
      .then((payload) => {
        if (!active) return;
        setOverview(payload);
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

  async function refresh() {
    setLoading(true);
    setError(undefined);

    try {
      setOverview(
        await loadOperationsOverview(),
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ati-card notification-planning">
      <div className="notification-registry__topbar">
        <div>
          <strong>Trusted automation</strong>
          <p>
            Scheduled planning, scheduler health, delivery failures, and
            correction risk are tracked independently from the SMTP send gate.
          </p>
        </div>
        <button
          className="ati-btn ati-btn--subtle"
          disabled={loading}
          onClick={() => void refresh()}
          type="button"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="form-notice form-notice--error">
          {error}
        </p>
      ) : null}

      {loading && !overview ? (
        <p>Loading automation state…</p>
      ) : overview ? (
        <>
          <div className="notification-shadow-banner">
            <span>
              {overview.automation
                .trustedAutomationEnabled
                ? "AUTO"
                : "SHADOW"}
            </span>
            <div>
              <strong>
                Planning automation{" "}
                {overview.automation
                  .trustedAutomationEnabled
                  ? "enabled"
                  : "shadow-only"}
              </strong>
              <p>
                SMTP automatic delivery is{" "}
                {overview.automation
                  .smtpCanExecuteAutomatically
                  ? "OPEN"
                  : "CLOSED"}
                . Planning automation and SMTP delivery remain separate
                release controls.
              </p>
            </div>
          </div>

          <div className="notification-occurrence-list">
            <article className="notification-occurrence-card">
              <div>
                <strong>Worker heartbeat</strong>
                <span>
                  {overview.workerHeartbeat.summary}
                </span>
                <span>
                  Last success:{" "}
                  {formatDateTime(
                    overview.worker
                      ?.lastSuccessfulAt ??
                      null,
                  )}
                </span>
                <span>
                  {overview.worker?.lastError
                    ? "Last error: " + overview.worker.lastError
                    : "No recorded worker error"}
                </span>
              </div>
              {/*
                * The verdict, beside the timestamp rather than instead of it.
                *
                * `LATE` and `NEVER_RUN` are the two states that need somebody, so they
                * are the only two that carry colour — the same rule the delivery rollup
                * on the planning list follows, so colour keeps meaning "look here".
                */}
              <span
                className={heartbeatClassName(
                  overview.workerHeartbeat.state,
                )}
              >
                {HEARTBEAT_LABEL[
                  overview.workerHeartbeat.state
                ]}
              </span>
            </article>

            <article className="notification-occurrence-card">
              <div>
                <strong>Last planning cycle</strong>
                <span>
                  Scanned{" "}
                  {overview.worker
                    ?.lastPlanningScanned ??
                    0}
                  {" · "}ready{" "}
                  {overview.worker
                    ?.lastPlanningReady ??
                    0}
                  {" · "}committed{" "}
                  {overview.worker
                    ?.lastPlanningCommitted ??
                    0}
                </span>
                <span>
                  Blocked{" "}
                  {overview.worker
                    ?.lastPlanningBlocked ??
                    0}
                  {" · "}due promoted{" "}
                  {overview.worker
                    ?.lastDuePromoted ??
                    0}
                </span>
              </div>
            </article>

            <article className="notification-occurrence-card">
              <div>
                <strong>Operational exceptions</strong>
                <span>
                  Open alerts:{" "}
                  {overview.alerts.openCount}
                </span>
                <span>
                  Unknown delivery outcomes:{" "}
                  {
                    overview.reconciliationOpenCount
                  }
                </span>
              </div>
            </article>

            <article className="notification-occurrence-card">
              <div>
                <strong>Delivery state</strong>
                <span>
                  Planned{" "}
                  {overview.jobs.PLANNED ?? 0}
                  {" · "}due{" "}
                  {overview.jobs.DUE ?? 0}
                  {" · "}retry{" "}
                  {overview.jobs.RETRY_WAIT ?? 0}
                </span>
                <span>
                  Sent{" "}
                  {overview.jobs.SENT ?? 0}
                  {" · "}failed{" "}
                  {overview.jobs.FAILED ?? 0}
                </span>
              </div>
            </article>
          </div>

          {overview.alerts.items.length ===
          0 ? (
            <div className="notification-empty">
              <strong>
                No open operational alerts
              </strong>
              <span>
                Scheduler lag, delivery failure, zero-recipient, and
                planning-blocked conditions will appear here.
              </span>
            </div>
          ) : (
            <div className="notification-occurrence-list">
              {overview.alerts.items.map(
                (alert) => (
                  <article
                    className="notification-occurrence-card"
                    key={alert.id}
                  >
                    <div>
                      <strong>
                        {alert.severity} ·{" "}
                        {alert.type}
                      </strong>
                      <span>
                        {alert.summary}
                      </span>
                      <span>
                        Last detected{" "}
                        {formatDateTime(
                          alert.lastDetectedAt,
                        )}
                      </span>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}

          {/*
            * The open list above answers "is anything wrong now". This answers the other
            * question, which the panel could not: has this been happening. An alert used
            * to vanish the moment it stopped firing, so a condition that recurred every
            * week looked like nothing at all.
            */}
          <AlertHistory />
        </>
      ) : null}
    </section>
  );
}

function formatDateTime(
  value: string | null,
): string {
  return value
    ? new Date(value).toLocaleString()
    : "not recorded";
}

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}
