"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  mountedPath,
} from "@/config/app";

type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  occurredAt: string;
  actor: {
    email: string;
    displayName: string | null;
  } | null;
};

type AuditResponse = {
  count: number;
  events: AuditEvent[];
  error?: string;
};

async function loadAudit(): Promise<
  AuditResponse
> {
  const response = await fetch(
    mountedPath(
      "/api/notification-operations/audit?limit=50",
    ),
    { cache: "no-store" },
  );

  const payload =
    (await response.json()) as AuditResponse;

  if (!response.ok) {
    throw new Error(
      payload.error ??
        "Could not load notification audit.",
    );
  }

  return payload;
}

export function NotificationAuditTimeline() {
  const [events, setEvents] =
    useState<AuditEvent[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string>();

  useEffect(() => {
    let active = true;

    void loadAudit()
      .then((payload) => {
        if (!active) return;
        setEvents(payload.events);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : String(loadError),
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="ati-card notification-planning">
      <div className="notification-registry__topbar">
        <div>
          <strong>
            Operational audit trail
          </strong>
          <p>
            Recent notification and publication actions with actor,
            resource, and durable audit timestamp.
          </p>
        </div>
        <div className="notification-registry__meta">
          <strong>{events.length}</strong>
          <span>recent events</span>
        </div>
      </div>

      {error ? (
        <p className="form-notice form-notice--error">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p>Loading audit events…</p>
      ) : events.length === 0 ? (
        <div className="notification-empty">
          <strong>
            No notification audit events
          </strong>
          <span>
            Operational mutations will appear here after durable audit
            evidence is recorded.
          </span>
        </div>
      ) : (
        <div className="notification-occurrence-list">
          {events.map((event) => (
            <article
              className="notification-occurrence-card"
              key={event.id}
            >
              <div>
                <strong>
                  {event.action}
                </strong>
                <span>
                  {event.entityType}
                  {event.entityId
                    ? ` · ${event.entityId}`
                    : ""}
                </span>
                <span>
                  {event.actor
                    ? event.actor.displayName ??
                      event.actor.email
                    : "System"}
                  {" · "}
                  {new Date(
                    event.occurredAt,
                  ).toLocaleString()}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
