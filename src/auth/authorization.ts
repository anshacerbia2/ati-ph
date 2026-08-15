import "server-only";

import {
  type PermissionCode,
} from "@/auth/authorization-catalog";
import {
  collectAuthorization,
  type UserAuthorization,
} from "@/auth/authorization-rules";
import { db } from "@/lib/db";

export async function getUserAuthorization(
  userId: string,
): Promise<UserAuthorization> {
  const assignments = await db.userRoleAssignment.findMany({
    where: {
      userId,
      role: { isActive: true },
    },
    select: {
      role: {
        select: {
          code: true,
          permissions: {
            where: {
              permission: { isActive: true },
            },
            select: {
              permission: {
                select: { code: true },
              },
            },
          },
        },
      },
    },
  });

  return collectAuthorization(assignments);
}

export async function userHasPermission(
  userId: string,
  permission: PermissionCode,
): Promise<boolean> {
  const assignment = await db.userRoleAssignment.findFirst({
    where: {
      userId,
      role: {
        isActive: true,
        permissions: {
          some: {
            permission: {
              code: permission,
              isActive: true,
            },
          },
        },
      },
    },
    select: { userId: true },
  });

  return assignment !== null;
}

export async function listAuthorizedMenus(userId: string) {
  const authorization = await getUserAuthorization(userId);
  const allowed = new Set(authorization.permissions);
  const menus = await db.menu.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      code: true,
      label: true,
      path: true,
      sortOrder: true,
      parent: {
        select: { code: true },
      },
      requiredPermission: {
        select: { code: true },
      },
    },
  });

  return menus.filter(
    (menu) =>
      !menu.requiredPermission ||
      allowed.has(menu.requiredPermission.code),
  );
}
