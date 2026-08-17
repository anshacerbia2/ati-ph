"use client";

import { useEffect, useMemo, useState } from "react";

import { mountedPath } from "@/config/app";

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

type ConfigurationResponse = {
  clients: Client[];
  regions: Region[];
  error?: string;
};

type MutationMethod = "POST" | "PATCH";

export function ClientRoutingAdmin({
  canManage,
}: {
  canManage: boolean;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [newClientName, setNewClientName] = useState("");

  async function loadConfiguration() {
    const response = await fetch(mountedPath("/api/admin/clients"), {
      cache: "no-store",
    });
    const payload = (await response.json()) as ConfigurationResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load client routing.");
    }

    setClients(payload.clients);
    setRegions(payload.regions);
  }

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      await loadConfiguration();
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load client routing."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void fetch(mountedPath("/api/admin/clients"), {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as ConfigurationResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load client routing.");
        }
        if (!cancelled) {
          setClients(payload.clients);
          setRegions(payload.regions);
          setLoading(false);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(errorMessage(loadError, "Could not load client routing."));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

    if (created) setNewClientName("");
  }

  return (
    <section className="ati-card client-routing-admin">
      <div className="client-routing-admin__header">
        <div>
          <p className="eyebrow">Routing authority</p>
          <h2>Client configuration</h2>
          <p>
            Configure service ownership, subscribed holiday regions, and
            governed notification recipients.
          </p>
        </div>
        {!canManage ? (
          <span className="ati-badge ati-badge--brand">Read only</span>
        ) : null}
      </div>

      {canManage ? (
        <form
          className="client-routing-create"
          onSubmit={createClient}
        >
          <label>
            <span>New client</span>
            <input
              maxLength={200}
              onChange={(event) => setNewClientName(event.target.value)}
              placeholder="Client name"
              required
              value={newClientName}
            />
          </label>
          <button
            className="ati-btn"
            disabled={busyKey === "client-create"}
            type="submit"
          >
            Add client
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
        <p className="region-empty">Loading client routing…</p>
      ) : clients.length === 0 ? (
        <p className="region-empty">No clients configured yet.</p>
      ) : (
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
  const [name, setName] = useState(client.name);
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
    const created = await mutate(
      `team-create-${client.id}`,
      `/api/admin/clients/${client.id}/service-teams`,
      "POST",
      { name: teamName },
      `Service team ${teamName.trim()} created.`,
    );
    if (created) setTeamName("");
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
    }
  }

  return (
    <details
      className={
        client.isActive
          ? "client-routing-card"
          : "client-routing-card client-routing-card--inactive"
      }
    >
      <summary>
        <span>
          <strong>{client.name}</strong>
          <small>
            {client.serviceTeams.length} teams · {client.contacts.length} contacts
          </small>
        </span>
        <span
          className={
            client.isActive
              ? "ati-badge ati-badge--success"
              : "ati-badge ati-badge--warning"
          }
        >
          {client.isActive ? "Active" : "Inactive"}
        </span>
      </summary>

      <div className="client-routing-card__body">
        {canManage ? (
          <div className="client-routing-inline-form">
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
              Save name
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
          <div className="client-routing-section">
            <div className="client-routing-section__heading">
              <div>
                <h3>Contacts</h3>
                <p>Client-owned recipient directory.</p>
              </div>
            </div>

            {canManage && client.isActive ? (
              <form
                className="client-routing-stack-form"
                onSubmit={createContact}
              >
                <input
                  maxLength={200}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="Display name (optional)"
                  value={contactName}
                />
                <input
                  maxLength={320}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="email@example.com"
                  required
                  type="email"
                  value={contactEmail}
                />
                <button
                  className="ati-btn ati-btn--secondary"
                  disabled={busyKey === `contact-create-${client.id}`}
                  type="submit"
                >
                  Add contact
                </button>
              </form>
            ) : null}

            <div className="client-contact-list">
              {client.contacts.length === 0 ? (
                <p className="client-routing-empty">No contacts yet.</p>
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
          </div>

          <div className="client-routing-section">
            <div className="client-routing-section__heading">
              <div>
                <h3>Service teams</h3>
                <p>Operational teams and their holiday subscriptions.</p>
              </div>
            </div>

            {canManage && client.isActive ? (
              <form
                className="client-routing-create-row"
                onSubmit={createTeam}
              >
                <input
                  maxLength={200}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="Service team name"
                  required
                  value={teamName}
                />
                <button
                  className="ati-btn ati-btn--secondary"
                  disabled={busyKey === `team-create-${client.id}`}
                  type="submit"
                >
                  Add team
                </button>
              </form>
            ) : null}

            <div className="client-team-list">
              {client.serviceTeams.length === 0 ? (
                <p className="client-routing-empty">No service teams yet.</p>
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
          </div>
        </div>
      </div>
    </details>
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

  return (
    <div
      className={
        contact.isActive
          ? "client-contact-row"
          : "client-contact-row client-contact-row--inactive"
      }
    >
      <div>
        <strong>{contact.displayName || contact.email}</strong>
        {contact.displayName ? <span>{contact.email}</span> : null}
      </div>

      {canManage ? (
        <details>
          <summary>Manage</summary>
          <div className="client-routing-mini-editor">
            <input
              maxLength={200}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
              value={displayName}
            />
            <input
              maxLength={320}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
            <button
              className="ati-btn ati-btn--compact ati-btn--secondary"
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
              className="ati-btn ati-btn--compact ati-btn--subtle"
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
        </details>
      ) : (
        <span
          className={
            contact.isActive
              ? "ati-badge ati-badge--success"
              : "ati-badge ati-badge--warning"
          }
        >
          {contact.isActive ? "Active" : "Inactive"}
        </span>
      )}
    </div>
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
  const [name, setName] = useState(team.name);
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
    }
  }

  return (
    <details
      className={
        team.isActive
          ? "client-team-card"
          : "client-team-card client-team-card--inactive"
      }
    >
      <summary>
        <span>
          <strong>{team.name}</strong>
          <small>{team.subscriptions.length} subscriptions</small>
        </span>
        <span
          className={
            team.isActive
              ? "ati-badge ati-badge--success"
              : "ati-badge ati-badge--warning"
          }
        >
          {team.isActive ? "Active" : "Inactive"}
        </span>
      </summary>

      <div className="client-team-card__body">
        {canManage ? (
          <div className="client-routing-inline-form">
            <input
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <button
              className="ati-btn ati-btn--compact ati-btn--secondary"
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
              className="ati-btn ati-btn--compact ati-btn--subtle"
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

        {canManage && client.isActive && team.isActive ? (
          <form
            className="client-subscription-create"
            onSubmit={createSubscription}
          >
            <select
              onChange={(event) => setRegionId(event.target.value)}
              required
              value={regionId}
            >
              <option value="">Select calendar region</option>
              {activeRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.code} — {region.displayName}
                </option>
              ))}
            </select>
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
              disabled={busyKey === `subscription-create-${team.id}`}
              type="submit"
            >
              Add subscription
            </button>
          </form>
        ) : null}

        <div className="client-subscription-list">
          {team.subscriptions.length === 0 ? (
            <p className="client-routing-empty">No subscriptions yet.</p>
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
    </details>
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
      { contactId },
      "Recipient assigned.",
    );

    if (assigned) setContactId("");
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
            className="ati-btn ati-btn--compact ati-btn--secondary"
            disabled={busyKey === `subscription-window-${subscription.id}`}
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
            Save window
          </button>
          <button
            className="ati-btn ati-btn--compact ati-btn--subtle"
            disabled={
              (!client.isActive || !team.isActive) &&
              !subscription.isActive
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
        <strong>Recipients</strong>
        <div className="client-recipient-list">
          {subscription.recipients.length === 0 ? (
            <span className="client-routing-empty">No recipients assigned.</span>
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
                {recipient.contact.displayName || recipient.contact.email}
                {canManage ? (
                  <button
                    aria-label={`${
                      recipient.isActive ? "Deactivate" : "Reactivate"
                    } recipient`}
                    disabled={
                      (!recipient.contact.isActive && !recipient.isActive) ||
                      busyKey === `recipient-toggle-${subscription.id}-${recipient.contactId}`
                    }
                    onClick={() =>
                      void mutate(
                        `recipient-toggle-${subscription.id}-${recipient.contactId}`,
                        `${baseUrl}/recipients/${recipient.contactId}`,
                        "PATCH",
                        { isActive: !recipient.isActive },
                        `Recipient ${
                          recipient.isActive ? "deactivated" : "reactivated"
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
              onChange={(event) => setContactId(event.target.value)}
              required
              value={contactId}
            >
              <option value="">Select client contact</option>
              {availableContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.displayName
                    ? `${contact.displayName} — ${contact.email}`
                    : contact.email}
                </option>
              ))}
            </select>
            <button
              className="ati-btn ati-btn--compact ati-btn--secondary"
              disabled={busyKey === `recipient-add-${subscription.id}`}
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
