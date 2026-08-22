"use client";

import { useEffect, useState } from "react";

import { mountedPath } from "@/config/app";

type DirectoryUser = {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  roleCodes: string[];
  activeSessions: number;
};

type AssignableRole = {
  code: string;
  name: string;
  description: string | null;
};

type Directory = { users: DirectoryUser[]; roles: AssignableRole[] };

async function fetchDirectory(signal?: AbortSignal): Promise<Directory> {
  const response = await fetch(mountedPath("/api/admin/users"), {
    signal,
    cache: "no-store",
  });
  const payload = (await response.json()) as Directory & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load users.");
  }

  return payload;
}

function loadErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not load users.";
}

/**
 * Who can use ATI PH, and what each of them may do.
 *
 * A row exists because somebody signed in, never because an administrator added them —
 * the realm decides who may authenticate and this database decides what they may do. The
 * screen says so instead of offering an invite field, which would quietly make ATI PH a
 * second place where accounts are created.
 */
export function UserAdmin({
  canManage,
  currentUserId,
}: {
  canManage: boolean;
  currentUserId: string;
}) {
  const [directory, setDirectory] = useState<Directory>({
    users: [],
    roles: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();

    void fetchDirectory(controller.signal)
      .then((next) => {
        setDirectory(next);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadErrorMessage(loadError));
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  async function mutate(key: string, body: unknown, successMessage: string) {
    setBusyKey(key);
    setError(undefined);
    setNotice(undefined);

    try {
      const response = await fetch(mountedPath("/api/admin/users"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: string;
        changed?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "The change could not be applied.");
      }

      setNotice(successMessage);
      setDirectory(await fetchDirectory());
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "The change could not be applied.",
      );
    } finally {
      setBusyKey(undefined);
    }
  }

  return (
    <section className="ati-card user-admin" aria-labelledby="user-admin-heading">
      <div className="user-admin__header">
        <p className="eyebrow">Access</p>
        <h2 id="user-admin-heading">Users and roles</h2>
        <p>
          Everyone who has signed in to ATI PH. People appear here after their
          first sign-in — ATI One&rsquo;s realm decides who may authenticate, and
          this screen decides what they may do once they are in.
        </p>
      </div>

      {error && (
        <p className="user-admin__message user-admin__message--error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="user-admin__message user-admin__message--notice" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="user-admin__empty">Loading users…</p>
      ) : directory.users.length === 0 ? (
        <p className="user-admin__empty">
          Nobody has signed in yet.
        </p>
      ) : (
        <div className="user-admin__scroll">
          <table className="user-admin__table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Roles</th>
                <th scope="col">Sessions</th>
                <th scope="col">Account</th>
              </tr>
            </thead>
            <tbody>
              {directory.users.map((user) => {
                const isSelf = user.id === currentUserId;
                const held = new Set(user.roleCodes);

                return (
                  <tr key={user.id} data-inactive={!user.isActive}>
                    <th scope="row">
                      <span className="user-admin__name">
                        {user.displayName ?? user.email}
                        {isSelf && (
                          <span className="user-admin__you"> · you</span>
                        )}
                      </span>
                      <span className="user-admin__email">{user.email}</span>
                    </th>

                    <td>
                      <div className="user-admin__roles">
                        {directory.roles.map((role) => {
                          const granted = held.has(role.code);
                          const key = `${user.id}:${role.code}`;

                          return (
                            <label
                              key={role.code}
                              className="user-admin__role"
                              title={role.description ?? role.name}
                            >
                              <input
                                type="checkbox"
                                checked={granted}
                                disabled={!canManage || busyKey === key}
                                onChange={() =>
                                  void mutate(
                                    key,
                                    {
                                      change: "role",
                                      userId: user.id,
                                      roleCode: role.code,
                                      granted: !granted,
                                    },
                                    `${role.name} ${granted ? "revoked from" : "granted to"} ${user.email}.`,
                                  )
                                }
                              />
                              {role.name}
                            </label>
                          );
                        })}
                      </div>
                      {user.roleCodes.length === 0 && (
                        /*
                         * Named, not left blank. A person with no role can sign in and
                         * is refused every screen, which they report as the app being
                         * broken rather than as access not yet granted.
                         */
                        <p className="user-admin__norole">
                          No role — can sign in, and every screen refuses them.
                        </p>
                      )}
                    </td>

                    <td>
                      {/*
                        Shown because revoking a role does not end a session. It changes
                        what the next request may do; a page already open keeps what it
                        rendered. During an incident that difference matters.
                      */}
                      {user.activeSessions === 0
                        ? "—"
                        : `${user.activeSessions} active`}
                    </td>

                    <td>
                      {user.isActive ? (
                        <button
                          type="button"
                          className="ati-btn ati-btn--secondary"
                          disabled={!canManage || isSelf || busyKey === user.id}
                          title={
                            isSelf
                              ? "You cannot deactivate your own account."
                              : "Ends access on the next request, whatever roles are held."
                          }
                          onClick={() =>
                            void mutate(
                              user.id,
                              {
                                change: "active",
                                userId: user.id,
                                isActive: false,
                              },
                              `${user.email} deactivated.`,
                            )
                          }
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ati-btn ati-btn--secondary"
                          disabled={!canManage || busyKey === user.id}
                          onClick={() =>
                            void mutate(
                              user.id,
                              {
                                change: "active",
                                userId: user.id,
                                isActive: true,
                              },
                              `${user.email} reactivated.`,
                            )
                          }
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!canManage && !loading && (
        <p className="user-admin__readonly">
          You can see who holds what, but not change it. Granting and revoking
          roles needs the <code>user.manage</code> permission.
        </p>
      )}
    </section>
  );
}
