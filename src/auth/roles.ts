import type { UserRole } from "@prisma/client";

import type { ServerEnv } from "@/lib/env";

type Claims = Record<string, unknown>;

function configuredRoles(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean),
  );
}

function tokenRoles(claims: Claims): Set<string> {
  const realmAccess = claims.realm_access;
  if (!realmAccess || typeof realmAccess !== "object") {
    return new Set();
  }

  const roles = (realmAccess as { roles?: unknown }).roles;
  return new Set(
    Array.isArray(roles)
      ? roles.filter((role): role is string => typeof role === "string")
      : [],
  );
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  return [...left].some((value) => right.has(value));
}

export function resolveUserRole(claims: Claims, env: ServerEnv): UserRole {
  const roles = tokenRoles(claims);

  if (intersects(roles, configuredRoles(env.KEYCLOAK_ADMIN_ROLES))) {
    return "ADMINISTRATOR";
  }

  if (intersects(roles, configuredRoles(env.KEYCLOAK_APPROVER_ROLES))) {
    return "APPROVER";
  }

  if (intersects(roles, configuredRoles(env.KEYCLOAK_OPERATOR_ROLES))) {
    return "OPERATOR";
  }

  return "AUDITOR";
}
