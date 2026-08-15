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

export function CalendarRegionAdmin() {
  const [regions, setRegions] = useState<CalendarRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
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
        throw new Error(payload.error ?? "Calendar-region update failed.");
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

  async function createRegion(event: React.FormEvent<HTMLFormElement>) {
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
    }
  }

  return (
    <section className="ati-card region-admin" aria-labelledby="region-admin-heading">
      <div className="region-admin__header">
        <div>
          <p className="eyebrow">Calendar authority</p>
          <h2 id="region-admin-heading">Calendar regions and source aliases</h2>
          <p>
            Imports resolve only active aliases owned by active regions. Region
            codes are canonical and are never edited after creation.
          </p>
        </div>
        <span className="ati-badge ati-badge--brand">Administrator only</span>
      </div>

      <form className="region-create-form" onSubmit={createRegion}>
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
          {busyKey === "create-region" ? "Creating…" : "Add region"}
        </button>
      </form>

      {error ? <p className="form-notice form-notice--error">{error}</p> : null}
      {notice ? <p className="form-notice form-notice--success">{notice}</p> : null}

      {loading ? (
        <p className="region-empty">Loading governed region registry…</p>
      ) : regions.length === 0 ? (
        <p className="region-empty">
          No regions configured. Imports will remain unavailable until an
          administrator creates at least one active alias.
        </p>
      ) : (
        <div className="region-list">
          {regions.map((region) => (
            <RegionEditor
              busyKey={busyKey}
              key={`${region.id}:${region.displayName}`}
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
  mutate,
}: {
  region: CalendarRegion;
  busyKey?: string;
  mutate: (
    key: string,
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    successMessage: string,
  ) => Promise<boolean>;
}) {
  const [name, setName] = useState(region.displayName);
  const [newAlias, setNewAlias] = useState("");

  const baseUrl = `/api/admin/calendar-regions/${region.id}`;

  async function addAlias(event: React.FormEvent<HTMLFormElement>) {
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
    <article className={`region-card ${region.isActive ? "" : "region-card--inactive"}`}>
      <div className="region-card__heading">
        <div className="region-code-block">
          <strong>{region.code}</strong>
          <span
            className={`ati-badge ${region.isActive ? "ati-badge--success" : "ati-badge--warning"}`}
          >
            {region.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <button
          className="ati-btn ati-btn--secondary"
          disabled={busyKey === `region-toggle-${region.id}`}
          onClick={() =>
            void mutate(
              `region-toggle-${region.id}`,
              baseUrl,
              "PATCH",
              { isActive: !region.isActive },
              `${region.code} ${region.isActive ? "deactivated" : "reactivated"}.`,
            )
          }
          type="button"
        >
          {region.isActive ? "Deactivate" : "Reactivate"}
        </button>
      </div>

      <div className="region-name-editor">
        <label>
          <span>Display name</span>
          <input
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
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
          onClick={() =>
            void mutate(
              `region-name-${region.id}`,
              baseUrl,
              "PATCH",
              { displayName: name },
              `${region.code} display name updated.`,
            )
          }
          type="button"
        >
          Save name
        </button>
      </div>

      <div className="alias-section">
        <div className="alias-section__title">
          <h3>Approved source aliases</h3>
          <span>{region.aliases.length}</span>
        </div>
        <div className="alias-list">
          {region.aliases.map((alias) => (
            <AliasEditor
              alias={alias}
              busyKey={busyKey}
              key={`${alias.id}:${alias.alias}`}
              mutate={mutate}
              region={region}
            />
          ))}
        </div>

        <form className="alias-create-form" onSubmit={addAlias}>
          <input
            aria-label={`New alias for ${region.code}`}
            maxLength={120}
            onChange={(event) => setNewAlias(event.target.value)}
            placeholder="Add approved source value"
            required
            value={newAlias}
          />
          <button
            className="ati-btn ati-btn--secondary"
            disabled={busyKey === `alias-create-${region.id}`}
            type="submit"
          >
            Add alias
          </button>
        </form>
      </div>
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
  const [value, setValue] = useState(alias.alias);
  const canonical = alias.normalizedAlias === region.code.toLowerCase();
  const aliasUrl = `/api/admin/calendar-regions/${region.id}/aliases/${alias.id}`;

  return (
    <div className={`alias-row ${alias.isActive ? "" : "alias-row--inactive"}`}>
      <input
        aria-label={`Alias for ${region.code}`}
        disabled={canonical}
        maxLength={120}
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
      <span className="alias-key">{alias.normalizedAlias}</span>
      {canonical ? <span className="ati-badge ati-badge--brand">Canonical</span> : null}
      <button
        className="toolbar-link"
        disabled={
          canonical ||
          !value.trim() ||
          value.trim() === alias.alias ||
          busyKey === `alias-name-${alias.id}`
        }
        onClick={() =>
          void mutate(
            `alias-name-${alias.id}`,
            aliasUrl,
            "PATCH",
            { alias: value },
            `Alias updated for ${region.code}.`,
          )
        }
        type="button"
      >
        Save
      </button>
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
            `Alias ${alias.isActive ? "deactivated" : "reactivated"} for ${region.code}.`,
          )
        }
        type="button"
      >
        {alias.isActive ? "Deactivate" : "Reactivate"}
      </button>
    </div>
  );
}
