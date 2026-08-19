export const PERMISSIONS = {
  CALENDAR_REGION_READ: "calendar_region.read",
  CALENDAR_REGION_MANAGE: "calendar_region.manage",
  IMPORT_READ: "import.read",
  IMPORT_CREATE: "import.create",
  IMPORT_APPROVE: "import.approve",
  CLIENT_READ: "client.read",
  CLIENT_MANAGE: "client.manage",
  NOTIFICATION_POLICY_READ: "notification_policy.read",
  NOTIFICATION_POLICY_MANAGE: "notification_policy.manage",
  NOTIFICATION_PLAN_READ: "notification_plan.read",
  NOTIFICATION_PLAN_COMMIT: "notification_plan.commit",
  NOTIFICATION_PLAN_APPROVE: "notification_plan.approve",
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
  {
    code: PERMISSIONS.CLIENT_READ,
    name: "Read client routing",
    description:
      "View clients, service teams, contacts, subscriptions, and recipients",
  },
  {
    code: PERMISSIONS.CLIENT_MANAGE,
    name: "Manage client routing",
    description:
      "Manage clients, service teams, contacts, subscriptions, and recipients",
  },
  {
    code: PERMISSIONS.NOTIFICATION_POLICY_READ,
    name: "Read notification policies",
    description: "View versioned notification policy configuration",
  },
  {
    code: PERMISSIONS.NOTIFICATION_POLICY_MANAGE,
    name: "Manage notification policies",
    description: "Create governed notification policy versions",
  },
  {
    code: PERMISSIONS.NOTIFICATION_PLAN_READ,
    name: "Read notification planning",
    description: "Run explainable notification-plan previews",
  },
  {
    code: PERMISSIONS.NOTIFICATION_PLAN_COMMIT,
    name: "Commit notification plans",
    description:
      "Commit a ready notification plan into immutable durable notification jobs",
  },
  {
    code: PERMISSIONS.NOTIFICATION_PLAN_APPROVE,
    name: "Approve notification plans",
    description:
      "Make maker-checker approval decisions for committed notification jobs",
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
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.NOTIFICATION_POLICY_READ,
    PERMISSIONS.NOTIFICATION_POLICY_MANAGE,
    PERMISSIONS.NOTIFICATION_PLAN_READ,
    PERMISSIONS.NOTIFICATION_PLAN_COMMIT,
    PERMISSIONS.NOTIFICATION_PLAN_APPROVE,
  ],
  OPERATOR: [
    PERMISSIONS.CALENDAR_REGION_READ,
    PERMISSIONS.IMPORT_READ,
    PERMISSIONS.IMPORT_CREATE,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.NOTIFICATION_POLICY_READ,
    PERMISSIONS.NOTIFICATION_PLAN_READ,
    PERMISSIONS.NOTIFICATION_PLAN_COMMIT,
  ],
  APPROVER: [
    PERMISSIONS.CALENDAR_REGION_READ,
    PERMISSIONS.IMPORT_READ,
    PERMISSIONS.IMPORT_APPROVE,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.NOTIFICATION_POLICY_READ,
    PERMISSIONS.NOTIFICATION_PLAN_READ,
    PERMISSIONS.NOTIFICATION_PLAN_APPROVE,
  ],
  AUDITOR: [
    PERMISSIONS.CALENDAR_REGION_READ,
    PERMISSIONS.IMPORT_READ,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.NOTIFICATION_POLICY_READ,
    PERMISSIONS.NOTIFICATION_PLAN_READ,
  ],
};

export type SystemMenuDefinition = {
  code: string;
  label: string;
  path?: string;
  parentCode?: string;
  requiredPermission?: PermissionCode;
  sortOrder: number;
};

export const SYSTEM_MENUS: readonly SystemMenuDefinition[] = [
  {
    code: "dashboard",
    label: "Overview",
    path: "/",
    sortOrder: 10,
  },
  {
    code: "public_holiday_operations",
    label: "Operations",
    requiredPermission: PERMISSIONS.IMPORT_READ,
    sortOrder: 20,
  },
  {
    code: "imports",
    label: "Imports",
    path: "/imports",
    parentCode: "public_holiday_operations",
    requiredPermission: PERMISSIONS.IMPORT_READ,
    sortOrder: 10,
  },
  {
    code: "notification_planning",
    label: "Notification Planning",
    path: "/notification-planning",
    parentCode: "public_holiday_operations",
    requiredPermission: PERMISSIONS.NOTIFICATION_PLAN_READ,
    sortOrder: 20,
  },
  {
    code: "administration",
    label: "Administration",
    sortOrder: 30,
  },
  {
    code: "calendar_regions",
    label: "Calendar Regions",
    path: "/admin/calendar-regions",
    parentCode: "administration",
    requiredPermission: PERMISSIONS.CALENDAR_REGION_READ,
    sortOrder: 10,
  },
  {
    code: "client_routing",
    label: "Client Routing",
    path: "/admin/client-routing",
    parentCode: "administration",
    requiredPermission: PERMISSIONS.CLIENT_READ,
    sortOrder: 20,
  },
  {
    code: "notification_policies",
    label: "Notification Policies",
    path: "/admin/notification-policies",
    parentCode: "administration",
    requiredPermission: PERMISSIONS.NOTIFICATION_POLICY_READ,
    sortOrder: 30,
  },
];
