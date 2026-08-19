"use client";

import { useEffect, useState } from "react";

import { mountedPath } from "@/config/app";

const PAGE_SIZE = 10;

type ScheduleSource = "GLOBAL" | "CLIENT_OVERRIDE";

type ScheduleVersion = {
  id: string;
  version: number;
  leadTimeValue: number | null;
  leadTimeMode: "CALENDAR_DAY" | "BUSINESS_DAY" | null;
  sendTimeLocal: string | null;
  timezone: string | null;
  weekendAdjustment: "UNCONFIRMED" | "NONE" | "PREVIOUS_BUSINESS_DAY" | "NEXT_BUSINESS_DAY";
  businessDayHolidayMode: "UNCONFIRMED" | "EXCLUDE_PUBLIC_HOLIDAYS" | "IGNORE_PUBLIC_HOLIDAYS";
  approvalMode: "UNCONFIRMED" | "REQUIRED" | "NOT_REQUIRED";
  isActive: boolean;
  changeReason: string | null;
  scheduleReady: boolean;
  scheduleIssues: string[];
};

type PolicyVersion = {
  id: string;
  version: number;
  holidayDayFilter: "WEEKDAY" | "WEEKEND" | "ALL";
  scheduleSource: ScheduleSource;
  leadTimeValue: number | null;
  leadTimeMode: "CALENDAR_DAY" | "BUSINESS_DAY" | null;
  sendTimeLocal: string | null;
  timezone: string | null;
  weekendAdjustment: "UNCONFIRMED" | "NONE" | "PREVIOUS_BUSINESS_DAY" | "NEXT_BUSINESS_DAY";
  businessDayHolidayMode: "UNCONFIRMED" | "EXCLUDE_PUBLIC_HOLIDAYS" | "IGNORE_PUBLIC_HOLIDAYS";
  approvalMode: "UNCONFIRMED" | "REQUIRED" | "NOT_REQUIRED";
  retryCeiling: number | null;
  automaticSendAllowed: boolean;
  isActive: boolean;
  changeReason: string | null;
  scheduleReady: boolean;
  scheduleIssues: string[];
};

type DeliveryRecipient = {
  contactId: string;
  displayName: string | null;
  email: string;
};

type Policy = {
  id: string;
  isActive: boolean;
  client: { id: string; name: string; isActive: boolean };
  serviceTeam: { id: string; name: string; isActive: boolean };
  subscription: {
    id: string;
    isActive: boolean;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    legacyClientMasterTag: string | null;
  };
  deliveryRouting: {
    to: DeliveryRecipient[];
    cc: DeliveryRecipient[];
  };
  calendarRegion: { id: string; code: string; displayName: string; isActive: boolean };
  versionCount: number;
  currentVersion: PolicyVersion | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
};

type GlobalSchedule = {
  id: string | null;
  isActive: boolean;
  versionCount: number;
  currentVersion: ScheduleVersion | null;
  recentVersions: ScheduleVersion[];
};

type PolicyResponse = {
  globalSchedule: GlobalSchedule;
  policies: Policy[];
  pagination: Pagination;
  error?: string;
};

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: PAGE_SIZE,
  pageCount: 1,
  total: 0,
  from: 0,
  to: 0,
};

export function NotificationPolicyAdmin({ canManage }: { canManage: boolean }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [globalSchedule, setGlobalSchedule] = useState<GlobalSchedule>({
    id: null,
    isActive: false,
    versionCount: 0,
    currentVersion: null,
    recentVersions: [],
  });
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  async function load(targetSearch: string, targetPage: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) });
    if (targetSearch) params.set("search", targetSearch);

    const response = await fetch(
      mountedPath(`/api/admin/notification-policies?${params.toString()}`),
      { cache: "no-store", signal },
    );
    const payload = (await response.json()) as PolicyResponse;
    if (!response.ok) throw new Error(payload.error ?? "Could not load notification policies.");
    return payload;
  }

  function apply(payload: PolicyResponse) {
    setGlobalSchedule(payload.globalSchedule);
    setPolicies(payload.policies);
    setPagination(payload.pagination);
    if (payload.pagination.page !== page) setPage(payload.pagination.page);
  }

  async function createGlobalScheduleVersion(body: unknown): Promise<boolean> {
    setBusyKey("global-schedule");
    setError(undefined);
    setNotice(undefined);

    try {
      const response = await fetch(
        mountedPath("/api/admin/notification-schedule/versions"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not create global schedule version.",
        );
      }

      setNotice("Global notification schedule version created.");
      await refresh();
      return true;
    } catch (createError) {
      setError(errorMessage(createError));
      return false;
    } finally {
      setBusyKey(undefined);
    }
  }

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      apply(await load(search, page));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(search, page, controller.signal)
      .then((payload) => {
        apply(payload);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(loadError));
        setLoading(false);
      });
    return () => controller.abort();
    // apply intentionally uses current pagination state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearSearch() {
    setLoading(true);
    setError(undefined);
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > pagination.pageCount || nextPage === page) return;
    setLoading(true);
    setError(undefined);
    setPage(nextPage);
  }

  async function createVersion(policyId: string, body: unknown): Promise<boolean> {
    setBusyKey(policyId);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await fetch(
        mountedPath(`/api/admin/notification-policies/${policyId}/versions`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as { error?: string; version?: PolicyVersion };
      if (!response.ok) throw new Error(payload.error ?? "Could not create policy version.");
      setNotice(`Policy version ${payload.version?.version ?? ""} created.`);
      await refresh();
      return true;
    } catch (mutationError) {
      setError(errorMessage(mutationError));
      return false;
    } finally {
      setBusyKey(undefined);
    }
  }

  return (
    <section className="ati-card notification-registry">
      <div className="notification-registry__topbar">
        <form className="notification-search" onSubmit={submitSearch} role="search">
          <label>
            <span>Search policies</span>
            <input
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Client or region"
              type="search"
              value={searchInput}
            />
          </label>
          <button className="ati-btn ati-btn--secondary" type="submit">Search</button>
          {search ? (
            <button className="ati-btn ati-btn--subtle" onClick={clearSearch} type="button">Clear</button>
          ) : null}
        </form>

        <div className="notification-registry__meta">
          <strong>{pagination.total}</strong><span>policies</span>
          {!canManage ? <span className="ati-badge ati-badge--brand">Read only</span> : null}
        </div>
      </div>

      <div className="notification-boundary-note">
        <strong>Shadow-mode boundary</strong>
        <span>Client PIC Email maps to TO and Client_Master.CC maps to CC. Scheduling uses one versioned global default unless a client explicitly selects a full client override. Automatic send stays hard-disabled.</span>
      </div>

      <GlobalScheduleCard
        busy={busyKey === "global-schedule"}
        canManage={canManage}
        createVersion={createGlobalScheduleVersion}
        schedule={globalSchedule}
      />

      {error ? <p className="form-notice form-notice--error">{error}</p> : null}
      {notice ? <p className="form-notice form-notice--success">{notice}</p> : null}

      {loading ? (
        <NotificationSkeleton />
      ) : policies.length === 0 ? (
        <div className="notification-empty"><strong>No policies found</strong><span>No matching policy configuration.</span></div>
      ) : (
        <div className="notification-policy-list">
          {policies.map((policy) => (
            <PolicyCard
              busy={busyKey === policy.id}
              canManage={canManage}
              createVersion={createVersion}
               globalSchedule={globalSchedule}
              key={policy.id}
              policy={policy}
            />
          ))}
        </div>
      )}

      <NotificationPagination pagination={pagination} loading={loading} goToPage={goToPage} />
    </section>
  );
}

function GlobalScheduleCard({
  schedule,
  canManage,
  busy,
  createVersion,
}: {
  schedule: GlobalSchedule;
  canManage: boolean;
  busy: boolean;
  createVersion: (body: unknown) => Promise<boolean>;
}) {
  const current = schedule.currentVersion;
  const [editing, setEditing] = useState(false);
  const [leadTimeValue, setLeadTimeValue] = useState(
    current?.leadTimeValue?.toString() ?? "",
  );
  const [leadTimeMode, setLeadTimeMode] = useState(
    current?.leadTimeMode ?? "",
  );
  const [sendTimeLocal, setSendTimeLocal] = useState(
    current?.sendTimeLocal ?? "",
  );
  const [timezone, setTimezone] = useState(current?.timezone ?? "");
  const [weekendAdjustment, setWeekendAdjustment] = useState(
    current?.weekendAdjustment ?? "UNCONFIRMED",
  );
  const [businessDayHolidayMode, setBusinessDayHolidayMode] = useState(
    current?.businessDayHolidayMode ?? "UNCONFIRMED",
  );
  const [approvalMode, setApprovalMode] = useState(
    current?.approvalMode ?? "UNCONFIRMED",
  );
  const [changeReason, setChangeReason] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const saved = await createVersion({
      leadTimeValue: leadTimeValue.trim()
        ? Number.parseInt(leadTimeValue, 10)
        : null,
      leadTimeMode: leadTimeMode || null,
      sendTimeLocal: sendTimeLocal || null,
      timezone: timezone.trim() || null,
      weekendAdjustment,
      businessDayHolidayMode,
      approvalMode,
      changeReason,
    });

    if (saved) {
      setEditing(false);
      setChangeReason("");
    }
  }

  return (
    <section className="notification-global-schedule">
      <div className="notification-global-schedule__header">
        <div>
          <p className="eyebrow">Default timing</p>
          <strong>Global notification schedule</strong>
          <span>
            Used by every client unless its active policy explicitly selects
            Client override.
          </span>
        </div>
        <div>
          <span
            className={
              current?.scheduleReady
                ? "ati-badge ati-badge--success"
                : "ati-badge ati-badge--warning"
            }
          >
            {current?.scheduleReady ? "Schedule ready" : "Schedule incomplete"}
          </span>
          {current ? (
            <span className="notification-version">v{current.version}</span>
          ) : null}
        </div>
      </div>

      <div className="notification-policy-facts">
        <PolicyFact
          label="Lead time"
          value={
            current?.leadTimeValue !== null &&
            current?.leadTimeValue !== undefined &&
            current.leadTimeMode
              ? `${current.leadTimeValue} ${current.leadTimeMode}`
              : "Not configured"
          }
        />
        <PolicyFact
          label="Local send"
          value={
            current?.sendTimeLocal && current.timezone
              ? `${current.sendTimeLocal} · ${current.timezone}`
              : "Not configured"
          }
        />
        <PolicyFact
          label="Weekend"
          value={current?.weekendAdjustment ?? "UNCONFIRMED"}
        />
        <PolicyFact
          label="Approval"
          value={current?.approvalMode ?? "UNCONFIRMED"}
        />
      </div>

      {current?.scheduleIssues.length ? (
        <div className="notification-policy-issues">
          <strong>Global configuration still required</strong>
          <div>
            {current.scheduleIssues.map((issue) => (
              <span key={issue}>{humanize(issue)}</span>
            ))}
          </div>
        </div>
      ) : null}

      {canManage ? (
        <div className="notification-policy-actions">
          <button
            className="ati-btn ati-btn--secondary"
            onClick={() => setEditing((value) => !value)}
            type="button"
          >
            {editing ? "Cancel" : "Create global version"}
          </button>
          <span>
            One global version changes the default timing for all inheriting
            clients; history is never rewritten.
          </span>
        </div>
      ) : null}

      {canManage && editing ? (
        <form className="notification-policy-form" onSubmit={save}>
          <Field label="Lead time">
            <input
              min="0"
              max="365"
              onChange={(event) => setLeadTimeValue(event.target.value)}
              placeholder="Unconfigured"
              type="number"
              value={leadTimeValue}
            />
          </Field>
          <Field label="Lead-time mode">
            <select
              onChange={(event) => setLeadTimeMode(event.target.value)}
              value={leadTimeMode}
            >
              <option value="">Unconfigured</option>
              <option value="CALENDAR_DAY">Calendar day</option>
              <option value="BUSINESS_DAY">Business day</option>
            </select>
          </Field>
          <Field label="Send time">
            <input
              onChange={(event) => setSendTimeLocal(event.target.value)}
              type="time"
              value={sendTimeLocal}
            />
          </Field>
          <Field label="IANA timezone">
            <input
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Asia/Jakarta"
              value={timezone}
            />
          </Field>
          <Field label="Weekend adjustment">
            <select
              onChange={(event) =>
                setWeekendAdjustment(
                  event.target.value as typeof weekendAdjustment,
                )
              }
              value={weekendAdjustment}
            >
              <option value="UNCONFIRMED">Unconfirmed</option>
              <option value="NONE">None</option>
              <option value="PREVIOUS_BUSINESS_DAY">
                Previous business day
              </option>
              <option value="NEXT_BUSINESS_DAY">
                Next business day
              </option>
            </select>
          </Field>
          <Field label="Business-day holiday rule">
            <select
              onChange={(event) =>
                setBusinessDayHolidayMode(
                  event.target.value as typeof businessDayHolidayMode,
                )
              }
              value={businessDayHolidayMode}
            >
              <option value="UNCONFIRMED">Unconfirmed</option>
              <option value="EXCLUDE_PUBLIC_HOLIDAYS">
                Exclude public holidays
              </option>
              <option value="IGNORE_PUBLIC_HOLIDAYS">
                Ignore public holidays
              </option>
            </select>
          </Field>
          <Field label="Approval">
            <select
              onChange={(event) =>
                setApprovalMode(event.target.value as typeof approvalMode)
              }
              value={approvalMode}
            >
              <option value="UNCONFIRMED">Unconfirmed</option>
              <option value="REQUIRED">Required</option>
              <option value="NOT_REQUIRED">Not required</option>
            </select>
          </Field>
          <label className="notification-policy-form__reason">
            <span>Change reason</span>
            <input
              maxLength={500}
              minLength={3}
              onChange={(event) => setChangeReason(event.target.value)}
              placeholder="Why is the global schedule changing?"
              required
              value={changeReason}
            />
          </label>
          <div className="notification-policy-form__footer">
            <span>Automatic send remains disabled in shadow mode.</span>
            <button className="ati-btn" disabled={busy} type="submit">
              Save global version
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function PolicyCard({
   policy,
   globalSchedule,
   canManage,
  busy,
  createVersion,
}: {
  policy: Policy;
   globalSchedule: GlobalSchedule;
  canManage: boolean;
  busy: boolean;
  createVersion: (policyId: string, body: unknown) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const current = policy.currentVersion;
  const [dayFilter, setDayFilter] = useState<"WEEKDAY" | "WEEKEND" | "ALL">(current?.holidayDayFilter ?? "ALL");
  const [scheduleSource, setScheduleSource] = useState<ScheduleSource>(
    current?.scheduleSource ?? "GLOBAL",
  );
  const [leadTimeValue, setLeadTimeValue] = useState(current?.leadTimeValue?.toString() ?? "");
  const [leadTimeMode, setLeadTimeMode] = useState(current?.leadTimeMode ?? "");
  const [sendTimeLocal, setSendTimeLocal] = useState(current?.sendTimeLocal ?? "");
  const [timezone, setTimezone] = useState(current?.timezone ?? "");
  const [weekendAdjustment, setWeekendAdjustment] = useState(current?.weekendAdjustment ?? "UNCONFIRMED");
  const [businessDayHolidayMode, setBusinessDayHolidayMode] = useState(current?.businessDayHolidayMode ?? "UNCONFIRMED");
  const [approvalMode, setApprovalMode] = useState(current?.approvalMode ?? "UNCONFIRMED");
  const [retryCeiling, setRetryCeiling] = useState(current?.retryCeiling?.toString() ?? "");
  const [changeReason, setChangeReason] = useState("");

  function openScheduleEditor() {
    setExpanded(true);
    setEditing(true);

    if (current?.scheduleSource !== "CLIENT_OVERRIDE") {
      const global = globalSchedule.currentVersion;

      setScheduleSource("CLIENT_OVERRIDE");
      setLeadTimeValue(global?.leadTimeValue?.toString() ?? "");
      setLeadTimeMode(global?.leadTimeMode ?? "");
      setSendTimeLocal(global?.sendTimeLocal ?? "");
      setTimezone(global?.timezone ?? "");
      setWeekendAdjustment(global?.weekendAdjustment ?? "UNCONFIRMED");
      setBusinessDayHolidayMode(
        global?.businessDayHolidayMode ?? "UNCONFIRMED",
      );
      setApprovalMode(global?.approvalMode ?? "UNCONFIRMED");
      setChangeReason("");
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await createVersion(policy.id, {
      holidayDayFilter: dayFilter,
      scheduleSource,
      leadTimeValue: leadTimeValue.trim() ? Number.parseInt(leadTimeValue, 10) : null,
      leadTimeMode: leadTimeMode || null,
      sendTimeLocal: sendTimeLocal || null,
      timezone: timezone.trim() || null,
      weekendAdjustment,
      businessDayHolidayMode,
      approvalMode,
      retryCeiling: retryCeiling.trim() ? Number.parseInt(retryCeiling, 10) : null,
      automaticSendAllowed: false,
      changeReason,
    });
    if (saved) {
      setEditing(false);
      setChangeReason("");
    }
  }

  return (
    <article className="notification-policy-card">
      <div className="notification-policy-card__summary">
        <div className="notification-policy-card__identity">
          <strong>{policy.client.name}</strong>
          <span>
            {policy.calendarRegion.displayName}
            {policy.subscription.legacyClientMasterTag
              ? ` · Client_Master Tag: ${policy.subscription.legacyClientMasterTag}`
              : ""}
          </span>
        </div>
        <div className="notification-policy-card__status">
          {current ? (
            <>
              <span className="notification-policy-chip">{dayFilterLabel(current.holidayDayFilter)}</span>
              <span className="notification-version">
                {current.scheduleSource === "GLOBAL" ? "Global schedule" : "Client override"}
              </span>
              <span className="notification-version">v{current.version}</span>
            </>
          ) : <span className="ati-badge ati-badge--warning">No active version</span>}
          {canManage && current ? (
            <button
              className="notification-text-action notification-text-action--schedule"
              onClick={openScheduleEditor}
              type="button"
            >
              {current.scheduleSource === "CLIENT_OVERRIDE"
                ? "Edit override"
                : "Override schedule"}
            </button>
          ) : null}
          <button
            aria-expanded={expanded}
            className="notification-text-action"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >{expanded ? "Close" : "Details"}</button>
        </div>
      </div>

      {expanded ? (
        <div className="notification-policy-card__body">
          <div className="notification-policy-source-note">
            <strong>Client_Master routing</strong>
            <span>
              The legacy Tag is preserved as source evidence only. It does not
              filter holiday matching until its business meaning is confirmed.
            </span>
          </div>

          <div className="notification-delivery-routing">
            <PolicyRecipientGroup
              label="Client PIC Email (TO)"
              recipients={policy.deliveryRouting.to}
            />
            <PolicyRecipientGroup
              label="CC"
              recipients={policy.deliveryRouting.cc}
            />
          </div>

          <div className="notification-policy-facts">
            <PolicyFact label="Effective subscription" value={`${policy.subscription.effectiveFrom ?? "Open"} → ${policy.subscription.effectiveTo ?? "Open"}`} />
            <PolicyFact
              label="Schedule source"
              value={
                current?.scheduleSource === "CLIENT_OVERRIDE"
                  ? `Client override · v${current.version}`
                  : globalScheduleLabel()
              }
            />
            <PolicyFact
              label="Global default"
              value={
                current?.scheduleSource === "CLIENT_OVERRIDE"
                  ? "Overridden for this client"
                  : "Inherited"
              }
            />
            <PolicyFact label="Delivery routing" value={`${policy.deliveryRouting.to.length} TO · ${policy.deliveryRouting.cc.length} CC`} />
          </div>

          {canManage ? (
            <div className="notification-policy-actions">
              <button className="ati-btn ati-btn--secondary" onClick={() => setEditing((value) => !value)} type="button">
                {editing ? "Cancel" : "Create new version"}
              </button>
              <span>Saving creates v{policy.versionCount + 1}; history is never rewritten.</span>
            </div>
          ) : null}

          {canManage && editing ? (
            <form className="notification-policy-form" onSubmit={save}>
              <Field label="Confirmed holiday date filter">
                <select onChange={(event) => setDayFilter(event.target.value as typeof dayFilter)} value={dayFilter}>
                  <option value="WEEKDAY">Weekday</option><option value="WEEKEND">Weekend</option><option value="ALL">All days</option>
                </select>
              </Field>
              <Field label="Schedule source">
                <select
                  onChange={(event) =>
                    setScheduleSource(event.target.value as ScheduleSource)
                  }
                  value={scheduleSource}
                >
                  <option value="GLOBAL">Use global default</option>
                  <option value="CLIENT_OVERRIDE">Client override</option>
                </select>
              </Field>
              {scheduleSource === "CLIENT_OVERRIDE" ? (
                <>
              <Field label="Lead time">
                <input min="0" max="365" onChange={(event) => setLeadTimeValue(event.target.value)} placeholder="Unconfigured" type="number" value={leadTimeValue} />
              </Field>
              <Field label="Lead-time mode">
                <select onChange={(event) => setLeadTimeMode(event.target.value)} value={leadTimeMode}>
                  <option value="">Unconfigured</option><option value="CALENDAR_DAY">Calendar day</option><option value="BUSINESS_DAY">Business day</option>
                </select>
              </Field>
              <Field label="Send time"><input onChange={(event) => setSendTimeLocal(event.target.value)} type="time" value={sendTimeLocal} /></Field>
              <Field label="IANA timezone" wide><input onChange={(event) => setTimezone(event.target.value)} placeholder="Australia/Sydney" value={timezone} /></Field>
              <Field label="Weekend adjustment">
                <select onChange={(event) => setWeekendAdjustment(
                      event.target.value as typeof weekendAdjustment,
                    )} value={weekendAdjustment}>
                  <option value="UNCONFIRMED">Unconfirmed</option><option value="NONE">None</option><option value="PREVIOUS_BUSINESS_DAY">Previous business day</option><option value="NEXT_BUSINESS_DAY">Next business day</option>
                </select>
              </Field>
              <Field label="Business-day holiday rule">
                <select onChange={(event) => setBusinessDayHolidayMode(
                      event.target.value as typeof businessDayHolidayMode,
                    )} value={businessDayHolidayMode}>
                  <option value="UNCONFIRMED">Unconfirmed</option><option value="EXCLUDE_PUBLIC_HOLIDAYS">Exclude public holidays</option><option value="IGNORE_PUBLIC_HOLIDAYS">Ignore public holidays</option>
                </select>
              </Field>
              <Field label="Approval">
                <select onChange={(event) => setApprovalMode(
                      event.target.value as typeof approvalMode,
                    )} value={approvalMode}>
                  <option value="UNCONFIRMED">Unconfirmed</option><option value="REQUIRED">Required</option><option value="NOT_REQUIRED">Not required</option>
                </select>
              </Field>
                </>
              ) : (
                <div className="notification-policy-inherit-note">
                  This client inherits the active global schedule version. Only
                  use Client override when the client has a confirmed exception.
                </div>
              )}
              <Field label="Retry ceiling"><input min="0" max="20" onChange={(event) => setRetryCeiling(event.target.value)} placeholder="Later delivery phase" type="number" value={retryCeiling} /></Field>
              <label className="notification-policy-form__reason">
                <span>Change reason</span>
                <input maxLength={500} minLength={3} onChange={(event) => setChangeReason(event.target.value)} placeholder="Why is this version being created?" required value={changeReason} />
              </label>
              <div className="notification-policy-form__footer">
                <span>Automatic send stays disabled in shadow mode.</span>
                <button className="ati-btn" disabled={busy} type="submit">Save version</button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "notification-policy-form__wide" : undefined}><span>{label}</span>{children}</label>;
}

function PolicyFact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function PolicyRecipientGroup({
  label,
  recipients,
}: {
  label: string;
  recipients: DeliveryRecipient[];
}) {
  return (
    <div className="notification-delivery-row">
      <strong>{label}</strong>
      <div>
        {recipients.length ? (
          recipients.map((recipient) => (
            <span
              className="notification-delivery-chip"
              key={recipient.contactId}
              title={recipient.email}
            >
              {recipient.displayName || recipient.email}
            </span>
          ))
        ) : (
          <span className="notification-delivery-empty">No active recipient</span>
        )}
      </div>
    </div>
  );
}

function NotificationPagination({ pagination, loading, goToPage }: { pagination: Pagination; loading: boolean; goToPage: (page: number) => void }) {
  if (pagination.total === 0) return null;
  return (
    <nav aria-label="Notification policy pagination" className="notification-pagination">
      <span>Showing <strong>{pagination.from}–{pagination.to}</strong> of <strong>{pagination.total}</strong></span>
      <div>
        <button disabled={pagination.page <= 1 || loading} onClick={() => goToPage(pagination.page - 1)} type="button">Prev</button>
        <span>Page {pagination.page} of {pagination.pageCount}</span>
        <button disabled={pagination.page >= pagination.pageCount || loading} onClick={() => goToPage(pagination.page + 1)} type="button">Next</button>
      </div>
    </nav>
  );
}

function NotificationSkeleton() {
  return <div className="notification-skeleton-list">{Array.from({ length: 5 }, (_, index) => <div className="notification-skeleton" key={index}><span /><span /></div>)}</div>;
}

function globalScheduleLabel() {
  return "Global default";
}

function dayFilterLabel(value: PolicyVersion["holidayDayFilter"]) {
  if (value === "WEEKDAY") return "Weekday";
  if (value === "WEEKEND") return "Weekend";
  return "All days";
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Notification policy request failed.";
}
