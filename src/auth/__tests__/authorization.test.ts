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
    const known = new Set(
      SYSTEM_PERMISSIONS.map((permission) => permission.code),
    );

    for (const permissionCodes of Object.values(ROLE_PERMISSION_CODES)) {
      for (const permissionCode of permissionCodes) {
        expect(known.has(permissionCode)).toBe(true);
      }
    }
  });

  it("keeps menu permission references inside the governed catalog", () => {
    const known = new Set(
      SYSTEM_PERMISSIONS.map((permission) => permission.code),
    );

    for (const menu of SYSTEM_MENUS) {
      if (menu.requiredPermission) {
        expect(known.has(menu.requiredPermission)).toBe(true);
      }
    }
  });

  it("keeps menu parent references inside the governed menu catalog", () => {
    const known = new Set(SYSTEM_MENUS.map((menu) => menu.code));

    for (const menu of SYSTEM_MENUS) {
      if (menu.parentCode) {
        expect(known.has(menu.parentCode)).toBe(true);
        expect(menu.parentCode).not.toBe(menu.code);
      }
    }
  });

  it("keeps route paths unique", () => {
    const paths = SYSTEM_MENUS.flatMap((menu) =>
      menu.path ? [menu.path] : [],
    );

    expect(new Set(paths).size).toBe(paths.length);
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
