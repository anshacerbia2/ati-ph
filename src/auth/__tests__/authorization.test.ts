import { describe, expect, it } from "vitest";

import {
  PERMISSIONS,
  ROLE_PERMISSION_CODES,
  SYSTEM_MENUS,
  SYSTEM_PERMISSIONS,
} from "@/auth/authorization-catalog";
import { collectAuthorization } from "@/auth/authorization-rules";

describe("application authorization", () => {
  it("keeps every role permission inside the governed permission catalog", () => {
    const known = new Set(SYSTEM_PERMISSIONS.map((permission) => permission.code));
    for (const permissionCodes of Object.values(ROLE_PERMISSION_CODES)) {
      for (const permissionCode of permissionCodes) {
        expect(known.has(permissionCode)).toBe(true);
      }
    }
  });

  it("keeps every menu visibility rule permission-backed", () => {
    const known = new Set(SYSTEM_PERMISSIONS.map((permission) => permission.code));
    for (const menu of SYSTEM_MENUS) {
      expect(known.has(menu.requiredPermission)).toBe(true);
    }
  });

  it("deduplicates roles and permissions from multiple assignments", () => {
    expect(
      collectAuthorization([
        {
          role: {
            code: "ADMINISTRATOR",
            permissions: [
              { permission: { code: PERMISSIONS.IMPORT_CREATE } },
              { permission: { code: PERMISSIONS.CALENDAR_REGION_MANAGE } },
            ],
          },
        },
        {
          role: {
            code: "OPERATOR",
            permissions: [
              { permission: { code: PERMISSIONS.IMPORT_CREATE } },
            ],
          },
        },
      ]),
    ).toEqual({
      roles: ["ADMINISTRATOR", "OPERATOR"],
      permissions: [
        "calendar_region.manage",
        "import.create",
      ],
    });
  });
});
