export type AssignmentProjection = {
  role: {
    code: string;
    permissions: Array<{
      permission: {
        code: string;
      };
    }>;
  };
};

export type UserAuthorization = {
  roles: string[];
  permissions: string[];
};

export function collectAuthorization(
  assignments: readonly AssignmentProjection[],
): UserAuthorization {
  const roles = new Set<string>();
  const permissions = new Set<string>();

  for (const assignment of assignments) {
    roles.add(assignment.role.code);
    for (const link of assignment.role.permissions) {
      permissions.add(link.permission.code);
    }
  }

  return {
    roles: [...roles].sort(),
    permissions: [...permissions].sort(),
  };
}
