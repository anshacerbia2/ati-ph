import { PrismaClient } from "@prisma/client";

import {
  SYSTEM_ROLES,
  type RoleCode,
} from "../src/auth/authorization-catalog";

const db = new PrismaClient();

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function roleCode(value: string | undefined): RoleCode {
  const normalized = value?.trim().toUpperCase();
  const allowed = SYSTEM_ROLES.map((role) => role.code);
  if (!normalized || !allowed.includes(normalized as RoleCode)) {
    throw new Error(
      `--role must be one of: ${allowed.join(", ")}`,
    );
  }
  return normalized as RoleCode;
}

async function main(): Promise<void> {
  const email = argument("email")?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      "Usage: npm run authz:grant -- --email user@example.com --role ADMINISTRATOR",
    );
  }

  const requestedRole = roleCode(argument("role"));
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new Error(
      `No ATI PH user exists for ${email}. The user must login through Keycloak once before a local role can be assigned.`,
    );
  }

  const role = await db.role.findUnique({
    where: { code: requestedRole },
    select: { id: true, code: true },
  });
  if (!role) {
    throw new Error(
      `Role ${requestedRole} is not seeded. Run npm run db:seed first.`,
    );
  }

  await db.$transaction(async (tx) => {
    await tx.userRoleAssignment.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      create: {
        userId: user.id,
        roleId: role.id,
      },
      update: {},
    });

    await tx.auditEvent.create({
      data: {
        action: "AUTHZ_ROLE_BOOTSTRAP_GRANTED",
        entityType: "User",
        entityId: user.id,
        metadata: {
          targetUserId: user.id,
          targetEmail: user.email,
          roleCode: role.code,
          source: "local-cli",
        },
      },
    });
  });

  console.info(
    `Granted ${role.code} to ${user.email}. Application permissions take effect on the next request.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
