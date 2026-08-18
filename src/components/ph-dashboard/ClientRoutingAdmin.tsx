"use client";

import { useEffect, useMemo, useState } from "react";

import { mountedPath } from "@/config/app";

const CLIENT_PAGE_SIZE = 10;

type Region = {
  id: string;
  code: string;
  displayName: string;
  isActive: boolean;
};

type Contact = {
  id: string;
  clientId: string;
  displayName: string | null;
  email: string;
  isActive: boolean;
};

type Recipient = {
  subscriptionId: string;
  contactId: string;
  recipientType: "TO" | "CC";
  isActive: boolean;
  contact: {
    id: string;
    displayName: string | null;
    email: string;
    isActive: boolean;
  };
};

type Subscription = {
  id: string;
  serviceTeamId: string;
  calendarRegionId: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
  calendarRegion: Region;
  recipients: Recipient[];
};

type ServiceTeam = {
  id: string;
  clientId: string;
  name: string;
  isActive: boolean;
  subscriptions: Subscription[];
};

type Client = {
  id: string;
  name: string;
  isActive: boolean;
  contacts: Contact[];
  serviceTeams: ServiceTeam[];
};

type ClientPagination = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
};

type ConfigurationResponse = {
  clients: Client[];
  regions: Region[];
  pagination: ClientPagination;
  error?: string;
};

type MutationMethod = "POST" | "PATCH";

const EMPTY_PAGINATION: ClientPagination = {
  page: 1,
  pageSize: CLIENT_PAGE_SIZE,
  pageCount: 1,
  total: 0,
  from: 0,
  to: 0,
};

export function ClientRoutingAdmin({
  canManage,
}: {
  canManage: boolean;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [pagination, setPagination] =
    useState<ClientPagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [newClientName, setNewClientName] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  async function loadConfiguration(
    targetSearch: string,
    targetPage: number,
    signal?: AbortSignal,
  ): Promise<ConfigurationResponse> {
    const params = new URLSearchParams({
      page: String(targetPage),
      pageSize: String(CLIENT_PAGE_SIZE),
    });

    if (targetSearch) {
      params.set("search", targetSearch);
    }

    const response = await fetch(
      mountedPath(`/api/admin/clients?${params.toString()}`),
      {
        cache: "no-store",
        signal,
      },
    );
    const payload = (await response.json()) as ConfigurationResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load client routing.");
    }

    return payload;
  }

  function applyConfiguration(payload: ConfigurationResponse) {
    setClients(payload.clients);
    setRegions(payload.regions);
    setPagination(payload.pagination);

    if (payload.pagination.page !== page) {
      setPage(payload.pagination.page);
    }
  }

  async function refresh() {
    setLoading(true);
    setError(undefined);

    try {
      const payload = await loadConfiguration(search, page);
      applyConfiguration(payload);
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load client routing."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    void loadConfiguration(search, page, controller.signal)
      .then((payload) => {
        applyConfiguration(payload);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(loadError, "Could not load client routing."));
        setLoading(false);
      });

    return () => controller.abort();
    // applyConfiguration intentionally uses the latest render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  async function mutate(
    key: string,
    url: string,
    method: MutationMethod,
    body: unknown,
    successMessage: string,
  ): Promise<boolean> {
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);

    try {
      const response = await fetch(mountedPath(url), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Client-routing update failed.");
      }

      setNotice(successMessage);
      await refresh();
      return true;
    } catch (mutationError) {
      setError(
        errorMessage(mutationError, "Client-routing update failed."),
      );
      return false;
    } finally {
      setBusyKey(undefined);
    }
  }

  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newClientName.trim();
    if (!name) return;

    const created = await mutate(
      "client-create",
      "/api/admin/clients",
      "POST",
      { name },
      `Client ${name} created.`,
    );

    if (created) {
      setNewClientName("");
      setCreatingClient(false);

      if (search || page !== 1) {
        setLoading(true);
        setError(undefined);
        setSearchInput("");
        setSearch("");
        setPage(1);
      }
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = searchInput.trim();

    if (nextSearch === search && page === 1) {
      void refresh();
      return;
    }

    setLoading(true);
    setError(undefined);
    setPage(1);
    setSearch(nextSearch);
  }

  function clearSearch() {
    setLoading(true);
    setError(undefined);
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  function goToPage(nextPage: number) {
    if (
      nextPage === pagination.page ||
      nextPage < 1 ||
      nextPage > pagination.pageCount
    ) {
      return;
    }

    setLoading(true);
    setError(undefined);
    setPage(nextPage);
  }

  const pageItems = paginationItems(
    pagination.page,
    pagination.pageCount,
  );

  return (
    <section className="ati-card client-routing-admin">
      <div className="client-routing-admin__header">
        <div>
          <p className="eyebrow">Routing authority</p>
          <h2>Client configuration</h2>
          <p>
            Govern client ownership, recipient routing, and holiday-region
            subscriptions from one controlled workspace.
          </p>
        </div>

        <div className="client-routing-admin__header-actions">
          {!canManage ? (
            <span className="ati-badge ati-badge--brand">Read only</span>
          ) : (
            <button
              className="ati-btn client-routing-primary-action"
              onClick={() => setCreatingClient((value) => !value)}
              type="button"
            >
              {creatingClient ? "Cancel" : "New client"}
            </button>
          )}
        </div>
      </div>

      {canManage && creatingClient ? (
        <form
          className="client-routing-create-panel"
          onSubmit={createClient}
        >
          <div>
            <strong>Create client</strong>
            <span>Add a new governed client to the routing registry.</span>
          </div>
          <label>
            <span>Client name</span>
            <input
              autoFocus
              maxLength={200}
              onChange={(event) => setNewClientName(event.target.value)}
              placeholder="Enter client name"
              required
              value={newClientName}
            />
          </label>
          <button
            className="ati-btn"
            disabled={busyKey === "client-create"}
            type="submit"
          >
            Create
          </button>
        </form>
      ) : null}

      <div className="client-routing-commandbar">
        <form
          className="client-routing-search-form"
          onSubmit={submitSearch}
          role="search"
        >
          <label>
            <span>Search clients</span>
            <input
              maxLength={200}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by client name"
              type="search"
              value={searchInput}
            />
          </label>
          <button
            className="ati-btn ati-btn--secondary"
            type="submit"
          >
            Search
          </button>
          {search ? (
            <button
              className="ati-btn ati-btn--subtle"
              onClick={clearSearch}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </form>

        <div className="client-routing-result-meta">
          <strong>{pagination.total}</strong>
          <span>{search ? "matching clients" : "clients"}</span>
        </div>
      </div>

      {error ? (
        <p className="form-notice form-notice--error">{error}</p>
      ) : null}
      {notice ? (
        <p className="form-notice form-notice--success">{notice}</p>
      ) : null}

      {loading ? (
        <ClientListSkeleton />
      ) : clients.length === 0 ? (
        <div className="client-routing-empty-state">
          <strong>No clients found</strong>
          <span>
            {search
              ? `No client matches “${search}”.`
              : "No clients are configured yet."}
          </span>
          {search ? (
            <button
              className="ati-btn ati-btn--secondary"
              onClick={clearSearch}
              type="button"
            >
              Clear search
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="client-routing-list">
            {clients.map((client) => (
              <ClientEditor
                busyKey={busyKey}
                canManage={canManage}
                client={client}
                key={client.id}
                mutate={mutate}
                regions={regions}
              />
            ))}
          </div>

          <nav
            aria-label="Client pagination"
            className="client-routing-pagination"
          >
            <div>
              Showing{" "}
              <strong>
                {pagination.from}–{pagination.to}
              </strong>{" "}
              of <strong>{pagination.total}</strong>
            </div>

            <div className="client-routing-pagination__controls">
              <button
                aria-label="Previous client page"
                className="client-routing-page-button"
                disabled={pagination.page <= 1 || loading}
                onClick={() => goToPage(pagination.page - 1)}
                type="button"
              >
                Prev
              </button>

              {pageItems.map((item, index) =>
                item === "ellipsis" ? (
                  <span
                    aria-hidden="true"
                    className="client-routing-page-ellipsis"
                    key={`ellipsis-${index}`}
                  >
                    …
                  </span>
                ) : (
                  <button
                    aria-current={
                      item === pagination.page ? "page" : undefined
                    }
                    className="client-routing-page-button"
                    key={item}
                    onClick={() => goToPage(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ),
              )}

              <button
                aria-label="Next client page"
                className="client-routing-page-button"
                disabled={
                  pagination.page >= pagination.pageCount || loading
                }
                onClick={() => goToPage(pagination.page + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}

function ClientEditor({
  client,
  regions,
  busyKey,
  canManage,
  mutate,
}: {
  client: Client;
  regions: Region[];
  busyKey?: string;
  canManage: boolean;
  mutate: Mutation;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(client.name);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  async function saveClient() {
    await mutate(
      `client-name-${client.id}`,
      `/api/admin/clients/${client.id}`,
      "PATCH",
      { name },
      `${client.name} updated.`,
    );
  }

  async function createTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = teamName.trim();
    if (!trimmedName) return;

    const created = await mutate(
      `team-create-${client.id}`,
      `/api/admin/clients/${client.id}/service-teams`,
      "POST",
      { name: trimmedName },
      `Service team ${trimmedName} created.`,
    );

    if (created) {
      setTeamName("");
      setShowTeamForm(false);
    }
  }

  async function createContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const created = await mutate(
      `contact-create-${client.id}`,
      `/api/admin/clients/${client.id}/contacts`,
      "POST",
      {
        displayName: contactName.trim() || null,
        email: contactEmail,
      },
      `Contact ${contactEmail.trim()} created.`,
    );

    if (created) {
      setContactName("");
      setContactEmail("");
      setShowContactForm(false);
    }
  }

  return (
    <article
      className={
        client.isActive
          ? "client-routing-card"
          : "client-routing-card client-routing-card--inactive"
      }
    >
      <div className="client-routing-card__summary">
        <div className="client-routing-card__identity">
          <strong>{client.name}</strong>
          <span>
            {client.serviceTeams.length}{" "}
            {client.serviceTeams.length === 1 ? "team" : "teams"}
            <i aria-hidden="true" />
            {client.contacts.length}{" "}
            {client.contacts.length === 1 ? "contact" : "contacts"}
          </span>
        </div>

        <div className="client-routing-card__summary-actions">
          <span
            className={
              client.isActive
                ? "ati-badge ati-badge--success"
                : "ati-badge ati-badge--warning"
            }
          >
            {client.isActive ? "Active" : "Inactive"}
          </span>
          <button
            aria-expanded={expanded}
            className="ati-btn ati-btn--secondary client-routing-detail-button"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? "Close" : "Details"}
            <span aria-hidden="true">{expanded ? "↑" : "↓"}</span>
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="client-routing-card__body">
          {canManage ? (
            <div className="client-routing-settings-bar">
              <div className="client-routing-settings-bar__title">
                <strong>Client settings</strong>
                <span>Rename or change client availability.</span>
              </div>
              <label>
                <span>Client name</span>
                <input
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </label>
              <button
                className="ati-btn ati-btn--secondary"
                disabled={
                  !name.trim() ||
                  name.trim() === client.name ||
                  busyKey === `client-name-${client.id}`
                }
                onClick={() => void saveClient()}
                type="button"
              >
                Save
              </button>
              <button
                className={
                  client.isActive
                    ? "ati-btn ati-btn--danger-subtle"
                    : "ati-btn ati-btn--subtle"
                }
                disabled={busyKey === `client-toggle-${client.id}`}
                onClick={() =>
                  void mutate(
                    `client-toggle-${client.id}`,
                    `/api/admin/clients/${client.id}`,
                    "PATCH",
                    { isActive: !client.isActive },
                    `${client.name} ${
                      client.isActive ? "deactivated" : "reactivated"
                    }.`,
                  )
                }
                type="button"
              >
                {client.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          ) : null}

          <div className="client-routing-columns">
            <section className="client-routing-section">
              <div className="client-routing-section__heading">
                <div>
                  <strong>Contacts</strong>
                  <span>Client-owned recipient directory</span>
                </div>
                <div className="client-routing-section__heading-actions">
                  <span className="client-routing-count">
                    {client.contacts.length}
                  </span>
                  {canManage && client.isActive ? (
                    <button
                      className="ati-btn ati-btn--secondary"
                      onClick={() =>
                        setShowContactForm((value) => !value)
                      }
                      type="button"
                    >
                      {showContactForm ? "Cancel" : "Add contact"}
                    </button>
                  ) : null}
                </div>
              </div>

              {canManage && client.isActive && showContactForm ? (
                <form
                  className="client-routing-add-panel"
                  onSubmit={createContact}
                >
                  <label>
                    <span>Display name</span>
                    <input
                      maxLength={200}
                      onChange={(event) =>
                        setContactName(event.target.value)
                      }
                      placeholder="Optional"
                      value={contactName}
                    />
                  </label>
                  <label>
                    <span>Email address</span>
                    <input
                      maxLength={320}
                      onChange={(event) =>
                        setContactEmail(event.target.value)
                      }
                      placeholder="name@company.com"
                      required
                      type="email"
                      value={contactEmail}
                    />
                  </label>
                  <button
                    className="ati-btn"
                    disabled={busyKey === `contact-create-${client.id}`}
                    type="submit"
                  >
                    Add
                  </button>
                </form>
              ) : null}

              <div className="client-contact-list">
                {client.contacts.length === 0 ? (
                  <p className="client-routing-empty">
                    No contacts configured.
                  </p>
                ) : (
                  client.contacts.map((contact) => (
                    <ContactEditor
                      busyKey={busyKey}
                      canManage={canManage}
                      client={client}
                      contact={contact}
                      key={contact.id}
                      mutate={mutate}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="client-routing-section">
              <div className="client-routing-section__heading">
                <div>
                  <strong>Service teams</strong>
                  <span>Operational routing and holiday subscriptions</span>
                </div>
                <div className="client-routing-section__heading-actions">
                  <span className="client-routing-count">
                    {client.serviceTeams.length}
                  </span>
                  {canManage && client.isActive ? (
                    <button
                      className="ati-btn ati-btn--secondary"
                      onClick={() => setShowTeamForm((value) => !value)}
                      type="button"
                    >
                      {showTeamForm ? "Cancel" : "Add team"}
                    </button>
                  ) : null}
                </div>
              </div>

              {canManage && client.isActive && showTeamForm ? (
                <form
                  className="client-routing-add-panel client-routing-add-panel--team"
                  onSubmit={createTeam}
                >
                  <label>
                    <span>Service team name</span>
                    <input
                      maxLength={200}
                      onChange={(event) => setTeamName(event.target.value)}
                      placeholder="Enter team name"
                      required
                      value={teamName}
                    />
                  </label>
                  <button
                    className="ati-btn"
                    disabled={busyKey === `team-create-${client.id}`}
                    type="submit"
                  >
                    Add
                  </button>
                </form>
              ) : null}

              <div className="client-team-list">
                {client.serviceTeams.length === 0 ? (
                  <p className="client-routing-empty">
                    No service teams configured.
                  </p>
                ) : (
                  client.serviceTeams.map((team) => (
                    <TeamEditor
                      busyKey={busyKey}
                      canManage={canManage}
                      client={client}
                      key={team.id}
                      mutate={mutate}
                      regions={regions}
                      team={team}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ContactEditor({
  client,
  contact,
  busyKey,
  canManage,
  mutate,
}: {
  client: Client;
  contact: Contact;
  busyKey?: string;
  canManage: boolean;
  mutate: Mutation;
}) {
  const [displayName, setDisplayName] = useState(contact.displayName ?? "");
  const [email, setEmail] = useState(contact.email);
  const [managing, setManaging] = useState(false);

  return (
    <article
      className={
        contact.isActive
          ? "client-contact-row"
          : "client-contact-row client-contact-row--inactive"
      }
    >
      <div className="client-contact-row__summary">
        <div className="client-contact-row__avatar" aria-hidden="true">
          {(contact.displayName || contact.email).charAt(0).toUpperCase()}
        </div>
        <div className="client-contact-row__identity">
          {contact.displayName ? (
            <strong>{contact.displayName}</strong>
          ) : null}
          <span title={contact.email}>{contact.email}</span>
        </div>

        <div className="client-contact-row__actions">
          {!contact.isActive ? (
            <span className="ati-badge ati-badge--warning">Inactive</span>
          ) : null}
          {canManage ? (
            <button
              aria-expanded={managing}
              className="client-routing-text-action"
              onClick={() => setManaging((value) => !value)}
              type="button"
            >
              {managing ? "Close" : "Manage"}
            </button>
          ) : null}
        </div>
      </div>

      {canManage && managing ? (
        <div className="client-contact-row__editor">
          <div className="client-contact-row__fields">
            <label>
              <span>Display name</span>
              <input
                maxLength={200}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Optional"
                value={displayName}
              />
            </label>
            <label>
              <span>Email address</span>
              <input
                maxLength={320}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
          </div>

          <div className="client-contact-row__editor-actions">
            <button
              className="ati-btn ati-btn--secondary"
              disabled={
                busyKey === `contact-save-${contact.id}` ||
                !email.trim()
              }
              onClick={() =>
                void mutate(
                  `contact-save-${contact.id}`,
                  `/api/admin/clients/${client.id}/contacts/${contact.id}`,
                  "PATCH",
                  {
                    displayName: displayName.trim() || null,
                    email,
                  },
                  `Contact ${email.trim()} updated.`,
                )
              }
              type="button"
            >
              Save
            </button>
            <button
              className={
                contact.isActive
                  ? "ati-btn ati-btn--danger-subtle"
                  : "ati-btn ati-btn--subtle"
              }
              disabled={
                (!client.isActive && !contact.isActive) ||
                busyKey === `contact-toggle-${contact.id}`
              }
              onClick={() =>
                void mutate(
                  `contact-toggle-${contact.id}`,
                  `/api/admin/clients/${client.id}/contacts/${contact.id}`,
                  "PATCH",
                  { isActive: !contact.isActive },
                  `Contact ${
                    contact.isActive ? "deactivated" : "reactivated"
                  }.`,
                )
              }
              type="button"
            >
              {contact.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function TeamEditor({
  client,
  team,
  regions,
  busyKey,
  canManage,
  mutate,
}: {
  client: Client;
  team: ServiceTeam;
  regions: Region[];
  busyKey?: string;
  canManage: boolean;
  mutate: Mutation;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(team.name);
  const [showSubscriptionForm, setShowSubscriptionForm] = useState(false);
  const [regionId, setRegionId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");

  const activeRegions = useMemo(
    () => regions.filter((region) => region.isActive),
    [regions],
  );

  async function createSubscription(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!regionId) return;

    const created = await mutate(
      `subscription-create-${team.id}`,
      `/api/admin/clients/${client.id}/service-teams/${team.id}/subscriptions`,
      "POST",
      {
        calendarRegionId: regionId,
        effectiveFrom: effectiveFrom || null,
        effectiveTo: effectiveTo || null,
      },
      "Holiday-region subscription created.",
    );

    if (created) {
      setRegionId("");
      setEffectiveFrom("");
      setEffectiveTo("");
      setShowSubscriptionForm(false);
    }
  }

  return (
    <article
      className={
        team.isActive
          ? "client-team-card"
          : "client-team-card client-team-card--inactive"
      }
    >
      <div className="client-team-card__summary">
        <div>
          <strong>{team.name}</strong>
          <span>
            {team.subscriptions.length}{" "}
            {team.subscriptions.length === 1
              ? "subscription"
              : "subscriptions"}
          </span>
        </div>
        <div className="client-team-card__summary-actions">
          <span
            className={
              team.isActive
                ? "ati-badge ati-badge--success"
                : "ati-badge ati-badge--warning"
            }
          >
            {team.isActive ? "Active" : "Inactive"}
          </span>
          <button
            aria-expanded={expanded}
            className="client-routing-text-action"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? "Close" : "Configure"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="client-team-card__body">
          {canManage ? (
            <div className="client-team-settings">
              <label>
                <span>Team name</span>
                <input
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </label>
              <button
                className="ati-btn ati-btn--secondary"
                disabled={
                  !name.trim() ||
                  name.trim() === team.name ||
                  busyKey === `team-save-${team.id}`
                }
                onClick={() =>
                  void mutate(
                    `team-save-${team.id}`,
                    `/api/admin/clients/${client.id}/service-teams/${team.id}`,
                    "PATCH",
                    { name },
                    `${team.name} updated.`,
                  )
                }
                type="button"
              >
                Save
              </button>
              <button
                className={
                  team.isActive
                    ? "ati-btn ati-btn--danger-subtle"
                    : "ati-btn ati-btn--subtle"
                }
                disabled={
                  (!client.isActive && !team.isActive) ||
                  busyKey === `team-toggle-${team.id}`
                }
                onClick={() =>
                  void mutate(
                    `team-toggle-${team.id}`,
                    `/api/admin/clients/${client.id}/service-teams/${team.id}`,
                    "PATCH",
                    { isActive: !team.isActive },
                    `${team.name} ${
                      team.isActive ? "deactivated" : "reactivated"
                    }.`,
                  )
                }
                type="button"
              >
                {team.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          ) : null}

          <div className="client-team-card__section-heading">
            <div>
              <strong>Holiday subscriptions</strong>
              <span>Regions and effective routing windows</span>
            </div>
            {canManage && client.isActive && team.isActive ? (
              <button
                className="ati-btn ati-btn--secondary"
                onClick={() =>
                  setShowSubscriptionForm((value) => !value)
                }
                type="button"
              >
                {showSubscriptionForm ? "Cancel" : "Add subscription"}
              </button>
            ) : null}
          </div>

          {canManage &&
          client.isActive &&
          team.isActive &&
          showSubscriptionForm ? (
            <form
              className="client-subscription-create"
              onSubmit={createSubscription}
            >
              <label className="client-subscription-create__region">
                <span>Calendar region</span>
                <select
                  onChange={(event) => setRegionId(event.target.value)}
                  required
                  value={regionId}
                >
                  <option value="">Select region</option>
                  {activeRegions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.code} — {region.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>From</span>
                <input
                  onChange={(event) =>
                    setEffectiveFrom(event.target.value)
                  }
                  type="date"
                  value={effectiveFrom}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  onChange={(event) => setEffectiveTo(event.target.value)}
                  type="date"
                  value={effectiveTo}
                />
              </label>
              <button
                className="ati-btn"
                disabled={
                  busyKey === `subscription-create-${team.id}`
                }
                type="submit"
              >
                Add
              </button>
            </form>
          ) : null}

          <div className="client-subscription-list">
            {team.subscriptions.length === 0 ? (
              <p className="client-routing-empty">
                No subscriptions configured.
              </p>
            ) : (
              team.subscriptions.map((subscription) => (
                <SubscriptionEditor
                  busyKey={busyKey}
                  canManage={canManage}
                  client={client}
                  key={subscription.id}
                  mutate={mutate}
                  subscription={subscription}
                  team={team}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function SubscriptionEditor({
  client,
  team,
  subscription,
  busyKey,
  canManage,
  mutate,
}: {
  client: Client;
  team: ServiceTeam;
  subscription: Subscription;
  busyKey?: string;
  canManage: boolean;
  mutate: Mutation;
}) {
  const [effectiveFrom, setEffectiveFrom] = useState(
    dateInputValue(subscription.effectiveFrom),
  );
  const [effectiveTo, setEffectiveTo] = useState(
    dateInputValue(subscription.effectiveTo),
  );
  const [contactId, setContactId] = useState("");
  const [recipientType, setRecipientType] =
    useState<"TO" | "CC">("TO");

  const assignedIds = new Set(
    subscription.recipients
      .filter((recipient) => recipient.isActive)
      .map((recipient) => recipient.contactId),
  );
  const availableContacts = client.contacts.filter(
    (contact) => contact.isActive && !assignedIds.has(contact.id),
  );

  const baseUrl =
    `/api/admin/clients/${client.id}/service-teams/${team.id}` +
    `/subscriptions/${subscription.id}`;

  async function assignRecipient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactId) return;

    const assigned = await mutate(
      `recipient-add-${subscription.id}`,
      `${baseUrl}/recipients`,
      "POST",
      { contactId, recipientType },
      `${recipientType} recipient assigned.`,
    );

    if (assigned) {
      setContactId("");
      setRecipientType("TO");
    }
  }

  return (
    <article
      className={
        subscription.isActive
          ? "client-subscription-card"
          : "client-subscription-card client-subscription-card--inactive"
      }
    >
      <div className="client-subscription-card__heading">
        <div>
          <strong>
            {subscription.calendarRegion.code} —{" "}
            {subscription.calendarRegion.displayName}
          </strong>
          <span>
            {subscription.effectiveFrom
              ? dateInputValue(subscription.effectiveFrom)
              : "Open start"}{" "}
            →{" "}
            {subscription.effectiveTo
              ? dateInputValue(subscription.effectiveTo)
              : "Open end"}
          </span>
        </div>
        <span
          className={
            subscription.isActive
              ? "ati-badge ati-badge--success"
              : "ati-badge ati-badge--warning"
          }
        >
          {subscription.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {canManage ? (
        <div className="client-subscription-controls">
          <label>
            <span>From</span>
            <input
              onChange={(event) => setEffectiveFrom(event.target.value)}
              type="date"
              value={effectiveFrom}
            />
          </label>
          <label>
            <span>To</span>
            <input
              onChange={(event) => setEffectiveTo(event.target.value)}
              type="date"
              value={effectiveTo}
            />
          </label>
          <button
            className="ati-btn ati-btn--secondary"
            disabled={
              busyKey === `subscription-window-${subscription.id}`
            }
            onClick={() =>
              void mutate(
                `subscription-window-${subscription.id}`,
                baseUrl,
                "PATCH",
                {
                  effectiveFrom: effectiveFrom || null,
                  effectiveTo: effectiveTo || null,
                },
                "Subscription effective window updated.",
              )
            }
            type="button"
          >
            Save
          </button>
          <button
            className={
              subscription.isActive
                ? "ati-btn ati-btn--danger-subtle"
                : "ati-btn ati-btn--subtle"
            }
            disabled={
              ((!client.isActive || !team.isActive) &&
                !subscription.isActive) ||
              busyKey === `subscription-toggle-${subscription.id}`
            }
            onClick={() =>
              void mutate(
                `subscription-toggle-${subscription.id}`,
                baseUrl,
                "PATCH",
                { isActive: !subscription.isActive },
                `Subscription ${
                  subscription.isActive ? "deactivated" : "reactivated"
                }.`,
              )
            }
            type="button"
          >
            {subscription.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      ) : null}

      <div className="client-recipient-block">
        <div className="client-recipient-block__heading">
          <strong>Recipients</strong>
          <span>{subscription.recipients.length}</span>
        </div>

        <div className="client-recipient-list">
          {subscription.recipients.length === 0 ? (
            <span className="client-routing-empty">
              No recipients assigned.
            </span>
          ) : (
            subscription.recipients.map((recipient) => (
              <span
                className={
                  recipient.isActive
                    ? "client-recipient-chip"
                    : "client-recipient-chip client-recipient-chip--inactive"
                }
                key={recipient.contactId}
              >
                <b>{recipient.recipientType}</b>
                <span title={recipient.contact.email}>
                  {recipient.contact.displayName ||
                    recipient.contact.email}
                </span>
                {canManage ? (
                  <button
                    aria-label={`${
                      recipient.isActive ? "Deactivate" : "Reactivate"
                    } recipient`}
                    disabled={
                      (!recipient.contact.isActive &&
                        !recipient.isActive) ||
                      busyKey ===
                        `recipient-toggle-${subscription.id}-${recipient.contactId}`
                    }
                    onClick={() =>
                      void mutate(
                        `recipient-toggle-${subscription.id}-${recipient.contactId}`,
                        `${baseUrl}/recipients/${recipient.contactId}`,
                        "PATCH",
                        { isActive: !recipient.isActive },
                        `Recipient ${
                          recipient.isActive
                            ? "deactivated"
                            : "reactivated"
                        }.`,
                      )
                    }
                    type="button"
                  >
                    {recipient.isActive ? "×" : "↻"}
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>

        {canManage && availableContacts.length > 0 ? (
          <form
            className="client-recipient-add"
            onSubmit={assignRecipient}
          >
            <select
              aria-label="Recipient type"
              onChange={(event) =>
                setRecipientType(event.target.value as "TO" | "CC")
              }
              value={recipientType}
            >
              <option value="TO">TO</option>
              <option value="CC">CC</option>
            </select>
            <select
              aria-label="Client contact"
              onChange={(event) => setContactId(event.target.value)}
              required
              value={contactId}
            >
              <option value="">Select contact</option>
              {availableContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.displayName
                    ? `${contact.displayName} — ${contact.email}`
                    : contact.email}
                </option>
              ))}
            </select>
            <button
              className="ati-btn ati-btn--secondary"
              disabled={
                busyKey === `recipient-add-${subscription.id}`
              }
              type="submit"
            >
              Assign
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function ClientListSkeleton() {
  return (
    <div
      aria-label="Loading clients"
      className="client-routing-skeleton-list"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div className="client-routing-skeleton" key={index}>
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function paginationItems(
  page: number,
  pageCount: number,
): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const values = new Set([
    1,
    pageCount,
    page - 1,
    page,
    page + 1,
  ]);
  const pages = [...values]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((left, right) => left - right);

  const result: Array<number | "ellipsis"> = [];
  let previous = 0;

  for (const value of pages) {
    if (previous && value - previous > 1) {
      result.push("ellipsis");
    }
    result.push(value);
    previous = value;
  }

  return result;
}

type Mutation = (
  key: string,
  url: string,
  method: MutationMethod,
  body: unknown,
  successMessage: string,
) => Promise<boolean>;

function dateInputValue(value: string | null): string {
  return value?.slice(0, 10) ?? "";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
