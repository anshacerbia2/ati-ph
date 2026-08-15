"use client";

import { useEffect, useState } from "react";

import { mountedPath } from "@/config/app";

type CalendarRegionAlias = {
  id: string;
  alias: string;
  normalizedAlias: string;
  isActive: boolean;
};

type CalendarRegion = {
  id: string;
  code: string;
  displayName: string;
  isActive: boolean;
  aliases: CalendarRegionAlias[];
};

type RegionResponse = {
  regions: CalendarRegion[];
  error?: string;
};

async function fetchCalendarRegions(): Promise<CalendarRegion[]> {
  const response = await fetch(mountedPath("/api/admin/calendar-regions"), {
    cache: "no-store",
  });
  const payload = (await response.json()) as RegionResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load calendar regions.");
  }

  return payload.regions;
}

function loadErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not load calendar regions.";
}

export function CalendarRegionAdmin({
  canManage,
}: {
  canManage: boolean;
}) {
  const [regions, setRegions] = useState<CalendarRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  async function refresh() {
    setLoading(true);
    setError(undefined);

    try {
      setRegions(await fetchCalendarRegions());
    } catch (loadError) {
      setError(loadErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void fetchCalendarRegions()
      .then((nextRegions) => {
        if (cancelled) {
          return;
        }

        setRegions(nextRegions);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }

        setError(loadErrorMessage(loadError));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function mutate(
    key: string,
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    successMessage: string,
  ) {
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);

    try {
      const response = await fetch(mountedPath(url), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Calendar-region update failed.",
        );
      }

      setNotice(successMessage);
      await refresh();
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Calendar-region update failed.",
      );
      return false;
    } finally {
      setBusyKey(undefined);
    }
  }

  async function createRegion(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const created = await mutate(
      "create-region",
      "/api/admin/calendar-regions",
      "POST",
      { code, displayName },
      `Region ${code.trim().toUpperCase()} created.`,
    );

    if (created) {
      setCode("");
      setDisplayName("");
      setShowCreate(false);
    }
  }

  return (
    <section
      className="ati-card region-admin"
      aria-labelledby="region-admin-heading"
    >
      <div className="region-admin__header">
        <div>
          <p className="eyebrow">Calendar authority</p>
          <h2 id="region-admin-heading">
            Calendar regions
          </h2>
          <p>
            Canonical region codes and the approved source values that
            workbook imports are allowed to resolve.
          </p>
        </div>

        {canManage ? (
          <button
            className="ati-btn ati-btn--secondary"
            onClick={() => setShowCreate((value) => !value)}
            type="button"
          >
            {showCreate ? "Cancel" : "Add region"}
          </button>
        ) : (
          <span className="ati-badge ati-badge--brand">
            Read only
          </span>
        )}
      </div>

      {showCreate ? (
        <form
          className="region-create-form region-create-form--compact"
          onSubmit={createRegion}
        >
          <label>
            <span>Code</span>
            <input
              maxLength={16}
              onChange={(event) => setCode(event.target.value)}
              placeholder="GB"
              required
              value={code}
            />
          </label>

          <label>
            <span>Display name</span>
            <input
              maxLength={120}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="United Kingdom"
              required
              value={displayName}
            />
          </label>

          <button
            className="ati-btn"
            disabled={busyKey === "create-region"}
            type="submit"
          >
            {busyKey === "create-region"
              ? "Creating…"
              : "Create region"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="form-notice form-notice--error">{error}</p>
      ) : null}

      {notice ? (
        <p className="form-notice form-notice--success">{notice}</p>
      ) : null}

      {loading ? (
        <p className="region-empty">
          Loading governed region registry…
        </p>
      ) : regions.length === 0 ? (
        <p className="region-empty">
          No calendar regions are configured yet.
        </p>
      ) : (
        <div className="region-list region-list--management">
          {regions.map((region) => (
            <RegionEditor
              busyKey={busyKey}
              canManage={canManage}
              key={region.id}
              mutate={mutate}
              region={region}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RegionEditor({
  region,
  busyKey,
  canManage,
  mutate,
}: {
  region: CalendarRegion;
  busyKey?: string;
  canManage: boolean;
  mutate: (
    key: string,
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    successMessage: string,
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(region.displayName);
  const [newAlias, setNewAlias] = useState("");

  const baseUrl = `/api/admin/calendar-regions/${region.id}`;

  async function saveRegionName() {
    const saved = await mutate(
      `region-name-${region.id}`,
      baseUrl,
      "PATCH",
      { displayName: name },
      `${region.code} display name updated.`,
    );

    if (saved) {
      setEditing(false);
    }
  }

  async function addAlias(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const created = await mutate(
      `alias-create-${region.id}`,
      `${baseUrl}/aliases`,
      "POST",
      { alias: newAlias },
      `Alias "${newAlias.trim()}" added to ${region.code}.`,
    );

    if (created) {
      setNewAlias("");
    }
  }

  return (
    <article
      className={
        region.isActive
          ? "region-management-card"
          : "region-management-card region-management-card--inactive"
      }
    >
      <div className="region-management-card__summary">
        <div className="region-summary-main">
          <div className="region-code-block">
            <strong>{region.code}</strong>
            <span
              className={
                region.isActive
                  ? "ati-badge ati-badge--success"
                  : "ati-badge ati-badge--warning"
              }
            >
              {region.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="region-summary-copy">
            <strong>{region.displayName}</strong>
            <span>
              {region.aliases.length} approved source{" "}
              {region.aliases.length === 1 ? "alias" : "aliases"}
            </span>
          </div>
        </div>

        {canManage ? (
          <div className="region-summary-actions">
            <button
              className="toolbar-link"
              onClick={() => {
                setName(region.displayName);
                setEditing((value) => !value);
              }}
              type="button"
            >
              {editing ? "Close" : "Manage"}
            </button>

            <button
              className="ati-btn ati-btn--secondary"
              disabled={
                busyKey === `region-toggle-${region.id}`
              }
              onClick={() =>
                void mutate(
                  `region-toggle-${region.id}`,
                  baseUrl,
                  "PATCH",
                  { isActive: !region.isActive },
                  `${region.code} ${
                    region.isActive
                      ? "deactivated"
                      : "reactivated"
                  }.`,
                )
              }
              type="button"
            >
              {region.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="region-alias-summary">
        {region.aliases.map((alias) => {
          const canonical =
            alias.normalizedAlias === region.code.toLowerCase();

          return (
            <span
              className={
                alias.isActive
                  ? "region-alias-chip"
                  : "region-alias-chip region-alias-chip--inactive"
              }
              key={alias.id}
            >
              <span>{alias.alias}</span>
              {canonical ? (
                <small>Canonical</small>
              ) : !alias.isActive ? (
                <small>Inactive</small>
              ) : null}
            </span>
          );
        })}
      </div>

      {editing && canManage ? (
        <div className="region-management-editor">
          <div className="region-editor-section">
            <div className="region-editor-section__heading">
              <div>
                <h3>Region details</h3>
                <p>
                  The code is canonical and cannot be changed.
                </p>
              </div>
            </div>

            <div className="region-detail-grid">
              <label>
                <span>Code</span>
                <input
                  disabled
                  value={region.code}
                />
              </label>

              <label>
                <span>Display name</span>
                <input
                  maxLength={120}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  value={name}
                />
              </label>

              <button
                className="ati-btn ati-btn--secondary"
                disabled={
                  !name.trim() ||
                  name.trim() === region.displayName ||
                  busyKey === `region-name-${region.id}`
                }
                onClick={() => void saveRegionName()}
                type="button"
              >
                Save name
              </button>
            </div>
          </div>

          <div className="region-editor-section">
            <div className="region-editor-section__heading">
              <div>
                <h3>Approved source aliases</h3>
                <p>
                  These are the exact source values allowed to resolve
                  to {region.code}.
                </p>
              </div>
            </div>

            <div className="alias-management-list">
              {region.aliases.map((alias) => (
                <AliasEditor
                  alias={alias}
                  busyKey={busyKey}
                  key={alias.id}
                  mutate={mutate}
                  region={region}
                />
              ))}
            </div>

            <form
              className="alias-add-row"
              onSubmit={addAlias}
            >
              <label>
                <span>Add source alias</span>
                <input
                  aria-label={`New alias for ${region.code}`}
                  maxLength={120}
                  onChange={(event) =>
                    setNewAlias(event.target.value)
                  }
                  placeholder="e.g. United Kingdom"
                  required
                  value={newAlias}
                />
              </label>

              <button
                className="ati-btn ati-btn--secondary"
                disabled={
                  busyKey === `alias-create-${region.id}`
                }
                type="submit"
              >
                Add alias
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function AliasEditor({
  region,
  alias,
  busyKey,
  mutate,
}: {
  region: CalendarRegion;
  alias: CalendarRegionAlias;
  busyKey?: string;
  mutate: (
    key: string,
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    successMessage: string,
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(alias.alias);
  const canonical =
    alias.normalizedAlias === region.code.toLowerCase();
  const aliasUrl =
    `/api/admin/calendar-regions/${region.id}/aliases/${alias.id}`;

  async function saveAlias() {
    const saved = await mutate(
      `alias-name-${alias.id}`,
      aliasUrl,
      "PATCH",
      { alias: value },
      `Alias updated for ${region.code}.`,
    );

    if (saved) {
      setEditing(false);
    }
  }

  return (
    <div
      className={
        alias.isActive
          ? "alias-management-row"
          : "alias-management-row alias-management-row--inactive"
      }
    >
      <div className="alias-management-value">
        {editing ? (
          <input
            aria-label={`Alias for ${region.code}`}
            disabled={canonical}
            maxLength={120}
            onChange={(event) =>
              setValue(event.target.value)
            }
            value={value}
          />
        ) : (
          <strong>{alias.alias}</strong>
        )}

        <span className="alias-key">
          {alias.normalizedAlias}
        </span>
      </div>

      <div className="alias-management-meta">
        {canonical ? (
          <span className="ati-badge ati-badge--brand">
            Canonical
          </span>
        ) : (
          <span
            className={
              alias.isActive
                ? "ati-badge ati-badge--success"
                : "ati-badge ati-badge--warning"
            }
          >
            {alias.isActive ? "Active" : "Inactive"}
          </span>
        )}
      </div>

      <div className="alias-management-actions">
        {!canonical ? (
          editing ? (
            <>
              <button
                className="toolbar-link"
                disabled={
                  !value.trim() ||
                  value.trim() === alias.alias ||
                  busyKey === `alias-name-${alias.id}`
                }
                onClick={() => void saveAlias()}
                type="button"
              >
                Save
              </button>

              <button
                className="toolbar-link"
                onClick={() => {
                  setValue(alias.alias);
                  setEditing(false);
                }}
                type="button"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="toolbar-link"
              onClick={() => setEditing(true)}
              type="button"
            >
              Rename
            </button>
          )
        ) : null}

        <button
          className="toolbar-link"
          disabled={
            (canonical && region.isActive) ||
            busyKey === `alias-toggle-${alias.id}`
          }
          onClick={() =>
            void mutate(
              `alias-toggle-${alias.id}`,
              aliasUrl,
              "PATCH",
              { isActive: !alias.isActive },
              `Alias ${
                alias.isActive
                  ? "deactivated"
                  : "reactivated"
              } for ${region.code}.`,
            )
          }
          type="button"
        >
          {alias.isActive ? "Deactivate" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}
