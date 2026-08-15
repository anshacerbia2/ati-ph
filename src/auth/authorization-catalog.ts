export const PERMISSIONS = {
  CALENDAR_REGION_READ: "calendar_region.read",
  CALENDAR_REGION_MANAGE: "calendar_region.manage",
  IMPORT_READ: "import.read",
  IMPORT_CREATE: "import.create",
  IMPORT_APPROVE: "import.approve",
} as const;

export type PermissionCode =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const SYSTEM_ROLES = [
  {
    code: "ADMINISTRATOR",
    name: "Administrator",
    description: "Full ATI PH application administration",
  },
  {
    code: "OPERATOR",
    name: "Operator",
    description: "Operational import and review activities",
  },
  {
    code: "APPROVER",
    name: "Approver",
    description: "Maker-checker approval activities",
  },
  {
    code: "AUDITOR",
    name: "Auditor",
    description: "Read-only operational and audit visibility",
  },
] as const;

export type RoleCode = (typeof SYSTEM_ROLES)[number]["code"];

export const SYSTEM_PERMISSIONS = [
  {
    code: PERMISSIONS.CALENDAR_REGION_READ,
    name: "Read calendar regions",
    description: "View calendar-region and alias registry data",
  },
  {
    code: PERMISSIONS.CALENDAR_REGION_MANAGE,
    name: "Manage calendar regions",
    description: "Create and update calendar regions and aliases",
  },
  {
    code: PERMISSIONS.IMPORT_READ,
    name: "Read imports",
    description: "View governed import batches and validation results",
  },
  {
    code: PERMISSIONS.IMPORT_CREATE,
    name: "Create imports",
    description: "Upload and validate governed workbooks",
  },
  {
    code: PERMISSIONS.IMPORT_APPROVE,
    name: "Approve imports",
    description: "Approve governed imports for canonical publication",
  },
] as const;

export const ROLE_PERMISSION_CODES: Record<
  RoleCode,
  readonly PermissionCode[]
> = {
  ADMINISTRATOR: [
    PERMISSIONS.CALENDAR_REGION_READ,
    PERMISSIONS.CALENDAR_REGION_MANAGE,
    PERMISSIONS.IMPORT_READ,
    PERMISSIONS.IMPORT_CREATE,
    PERMISSIONS.IMPORT_APPROVE,
  ],
  OPERATOR: [
    PERMISSIONS.CALENDAR_REGION_READ,
    PERMISSIONS.IMPORT_READ,
    PERMISSIONS.IMPORT_CREATE,
  ],
  APPROVER: [
    PERMISSIONS.CALENDAR_REGION_READ,
    PERMISSIONS.IMPORT_READ,
    PERMISSIONS.IMPORT_APPROVE,
  ],
  AUDITOR: [
    PERMISSIONS.CALENDAR_REGION_READ,
    PERMISSIONS.IMPORT_READ,
  ],
};

export const SYSTEM_MENUS = [
  {
    code: "public_holiday_operations",
    label: "Public Holiday Operations",
    path: "/",
    requiredPermission: PERMISSIONS.IMPORT_READ,
    sortOrder: 10,
  },
  {
    code: "calendar_regions",
    label: "Calendar Regions",
    path: undefined,
    requiredPermission: PERMISSIONS.CALENDAR_REGION_READ,
    sortOrder: 20,
  },
] as const;
