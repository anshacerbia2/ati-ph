import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MODEL_SCHEMAS = {
  "User": "access",
  "AuthSession": "access",
  "Role": "access",
  "Permission": "access",
  "RolePermission": "access",
  "UserRoleAssignment": "access",
  "Menu": "access",
  "AuditEvent": "governance",
  "OutboxEvent": "governance",
  "FileArtifact": "governance",
  "ImportBatch": "import",
  "ImportRow": "import",
  "ImportValidationIssue": "import",
  "ApprovalRequest": "approval",
  "CalendarRegion": "holiday",
  "CalendarRegionAlias": "holiday",
  "HolidayDefinition": "holiday",
  "HolidayOccurrence": "holiday",
  "HolidayOccurrenceRegion": "holiday",
  "HolidayOccurrenceDate": "holiday",
  "Client": "routing",
  "ServiceTeam": "routing",
  "Contact": "routing",
  "ClientSubscription": "routing",
  "SubscriptionRecipient": "routing",
  "NotificationPolicy": "notification",
  "NotificationPolicyVersion": "notification"
} as const;
const ENUM_SCHEMAS = {
  "OutboxStatus": "governance",
  "ArtifactType": "governance",
  "ImportBatchStatus": "import",
  "ImportRowStatus": "import",
  "ValidationSeverity": "import",
  "ApprovalStatus": "approval",
  "SubscriptionRecipientType": "routing",
  "HolidayDayFilter": "notification",
  "NotificationLeadTimeMode": "notification",
  "NotificationWeekendAdjustment": "notification",
  "NotificationBusinessDayHolidayMode": "notification",
  "NotificationApprovalMode": "notification"
} as const;
const TABLE_SCHEMAS = {
  "users": "access",
  "auth_sessions": "access",
  "roles": "access",
  "permissions": "access",
  "role_permissions": "access",
  "user_roles": "access",
  "menus": "access",
  "audit_events": "governance",
  "outbox_events": "governance",
  "file_artifacts": "governance",
  "import_batches": "import",
  "import_rows": "import",
  "import_validation_issues": "import",
  "approval_requests": "approval",
  "calendar_regions": "holiday",
  "calendar_region_aliases": "holiday",
  "holiday_definitions": "holiday",
  "holiday_occurrences": "holiday",
  "holiday_occurrence_regions": "holiday",
  "holiday_occurrence_dates": "holiday",
  "clients": "routing",
  "service_teams": "routing",
  "contacts": "routing",
  "client_subscriptions": "routing",
  "subscription_recipients": "routing",
  "notification_policies": "notification",
  "notification_policy_versions": "notification"
} as const;

const schemaSource = fs.readFileSync(
  path.join(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);

function prismaBlock(kind: "model" | "enum", name: string): string {
  const start = schemaSource.indexOf(`${kind} ${name} {`);
  if (start < 0) throw new Error(`${kind} ${name} not found`);

  const nextModel = schemaSource.indexOf("\nmodel ", start + 1);
  const nextEnum = schemaSource.indexOf("\nenum ", start + 1);
  const candidates = [nextModel, nextEnum].filter(
    (value) => value >= 0,
  );
  const end = candidates.length
    ? Math.min(...candidates)
    : schemaSource.length;

  return schemaSource.slice(start, end);
}

function productionSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    if (entry.name === "__tests__") continue;

    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...productionSourceFiles(full));
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

describe("database schema boundaries", () => {
  it("assigns every application model and native enum to its bounded context", () => {
    expect(schemaSource).toContain(
      'schemas  = ["access", "approval", "governance", "holiday", "import", "notification", "routing"]',
    );

    for (const [name, schema] of Object.entries(MODEL_SCHEMAS)) {
      expect(prismaBlock("model", name)).toContain(
        `@@schema("${schema}")`,
      );
    }

    for (const [name, schema] of Object.entries(ENUM_SCHEMAS)) {
      expect(prismaBlock("enum", name)).toContain(
        `@@schema("${schema}")`,
      );
    }
  });

  it("does not leave bounded-context tables unqualified in production raw SQL", () => {
    const relationKeywords =
      "(?:FROM|JOIN|UPDATE|INTO|DELETE\\s+FROM|LOCK\\s+TABLE)";

    for (const full of productionSourceFiles(
      path.join(process.cwd(), "src"),
    )) {
      const source = fs.readFileSync(full, "utf8");

      if (
        !source.includes("$queryRaw") &&
        !source.includes("$executeRaw") &&
        !source.includes("Prisma.sql")
      ) {
        continue;
      }

      for (const table of Object.keys(TABLE_SCHEMAS)) {
        expect(source).not.toMatch(
          new RegExp(
            `${relationKeywords}\\s+"${table}"`,
            "i",
          ),
        );
        expect(source).not.toMatch(
          new RegExp(
            `${relationKeywords}\\s+${table}\\b`,
            "i",
          ),
        );
      }
    }
  });
});
