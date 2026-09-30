/**
 * What a role can be allowed to do in the admin portal: pages, and the
 * actions inside each page. Permission keys are "<page>.<action>"; every page
 * has "view". The admin dashboard reads this catalog (GET /api/access/catalog).
 */
export type CatalogPage = {
  key: string;
  label: string;
  group: "Overview" | "Employee Management" | "Attendance & Leave" | "Reports" | "Work" | "Admin Controls";
  href: string;
  actions: Array<{ key: string; label: string }>;
};

export const ACCESS_PAGES: CatalogPage[] = [
  { key: "overview", label: "Overview", group: "Overview", href: "/dashboard", actions: [] },

  {
    key: "employees",
    label: "Employees",
    group: "Employee Management",
    href: "/dashboard/employees",
    actions: [
      { key: "create", label: "Add employees" },
      { key: "edit", label: "Edit employees" },
      { key: "deactivate", label: "Mark inactive / restore" },
      { key: "passwords", label: "Send login details, set passwords, send links" },
      { key: "admin_logins", label: "Give people admin-portal roles" },
      { key: "leave_policy", label: "Change leave policy, allowances and blocks" },
    ],
  },
  { key: "departments", label: "Departments", group: "Employee Management", href: "/dashboard/departments", actions: [{ key: "edit", label: "Add / edit departments" }] },
  { key: "devices", label: "Devices", group: "Employee Management", href: "/dashboard/devices", actions: [{ key: "manage", label: "Change device settings" }] },
  { key: "screenshots", label: "Screenshots", group: "Employee Management", href: "/dashboard/screenshots", actions: [] },
  { key: "grievances", label: "Grievances", group: "Employee Management", href: "/dashboard/grievances", actions: [{ key: "resolve", label: "Resolve grievances" }] },

  { key: "attendance", label: "Attendance", group: "Attendance & Leave", href: "/dashboard/attendance", actions: [{ key: "edit", label: "Edit attendance" }] },
  {
    key: "requests",
    label: "Requests",
    group: "Attendance & Leave",
    href: "/dashboard/requests",
    actions: [{ key: "decide", label: "Approve / reject requests" }],
  },
  {
    key: "locations",
    label: "Locations",
    group: "Attendance & Leave",
    href: "/dashboard/locations",
    actions: [
      { key: "edit", label: "Manage locations and Mark Attendance settings" },
      { key: "decide", label: "Approve / reject work from elsewhere" },
    ],
  },
  { key: "shifts", label: "Shifts", group: "Attendance & Leave", href: "/dashboard/shifts", actions: [{ key: "edit", label: "Add / edit shifts" }] },
  { key: "holidays", label: "Holidays", group: "Attendance & Leave", href: "/dashboard/holidays", actions: [{ key: "edit", label: "Add / edit holidays" }] },
  { key: "break-scheduler", label: "Break Scheduler", group: "Attendance & Leave", href: "/dashboard/break-scheduler", actions: [{ key: "edit", label: "Change break schedules" }] },

  { key: "daily-reports", label: "To-Do & EOD", group: "Reports", href: "/dashboard/daily-reports", actions: [] },
  { key: "analytics", label: "Analytics", group: "Reports", href: "/dashboard/analytics", actions: [] },
  { key: "reports", label: "Custom Reports", group: "Reports", href: "/dashboard/reports", actions: [] },

  { key: "welcome-calls", label: "Welcome Calls", group: "Work", href: "/dashboard/welcome-calls", actions: [{ key: "manage", label: "Manage campaigns and leads" }] },
  { key: "assigned-tasks", label: "Assigned Tasks", group: "Work", href: "/dashboard/assigned-tasks", actions: [{ key: "edit", label: "Assign / edit tasks" }] },
  { key: "productivity-rules", label: "Productivity Rules", group: "Work", href: "/dashboard/productivity-rules", actions: [{ key: "edit", label: "Change rules" }] },

  { key: "admin-controls", label: "Admin Controls", group: "Admin Controls", href: "/dashboard/admin-controls", actions: [] },
  { key: "workforce-brain", label: "Workforce Brain", group: "Admin Controls", href: "/dashboard/workforce-brain", actions: [{ key: "manage", label: "Run / change the Brain" }] },
  { key: "sync-errors", label: "Sync Errors", group: "Admin Controls", href: "/dashboard/sync-errors", actions: [] },
];

export const ALL_PERMISSIONS: string[] = ACCESS_PAGES.flatMap((page) => [
  `${page.key}.view`,
  ...page.actions.map((a) => `${page.key}.${a.key}`),
]);

/** Roles the server understands; custom roles act as one of these. */
export const BASE_ROLES = ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] as const;
export type BaseRole = (typeof BASE_ROLES)[number];

/** Built-in roles and their defaults (the same access as before roles existed). */
export const BUILT_IN_ROLES: Array<{
  key: BaseRole;
  name: string;
  description: string;
  adminPortal: boolean;
  fullAccess: boolean;
}> = [
  { key: "ADMIN", name: "Admin", description: "Runs the admin portal.", adminPortal: true, fullAccess: true },
  { key: "HR", name: "HR", description: "People and leave.", adminPortal: false, fullAccess: true },
  { key: "MANAGER", name: "Manager", description: "Leads a team; team analytics on the employee dashboard.", adminPortal: false, fullAccess: true },
  { key: "EMPLOYEE", name: "Employee", description: "Uses the agent and the employee dashboard.", adminPortal: false, fullAccess: true },
];

/**
 * Admin actions (anything that changes data, plus a few sensitive reads) and
 * the permission each needs. Only checked for roles with admin-portal access
 * that don't have full access. First match wins.
 */
type Rule = { methods: RegExp; path: RegExp; permission: string };
const WRITE = /^(POST|PUT|PATCH|DELETE)$/;
const READ = /^GET$/;

export const ACTION_RULES: Rule[] = [
  { methods: WRITE, path: /^\/api\/users\/[^/]+\/(send-login-details|set-password|send-reset-link)$/, permission: "employees.passwords" },
  { methods: /^POST$/, path: /^\/api\/users\/?$/, permission: "employees.create" },
  { methods: /^DELETE$/, path: /^\/api\/users\//, permission: "employees.deactivate" },
  { methods: /^(PUT|PATCH)$/, path: /^\/api\/users\//, permission: "employees.edit" },
  { methods: WRITE, path: /^\/api\/attendance\/time-off\/(leave-policy|leave-allowances|leave-blocks|leave-balance)/, permission: "employees.leave_policy" },
  { methods: WRITE, path: /^\/api\/departments/, permission: "departments.edit" },
  // The agent reports its own errors (POST /errors): never blocked.
  { methods: WRITE, path: /^\/api\/devices\/(?!errors$)/, permission: "devices.manage" },
  { methods: READ, path: /^\/api\/screenshots\//, permission: "screenshots.view" },
  { methods: /^POST$/, path: /^\/api\/screenshots\/toggle\//, permission: "employees.edit" },
  { methods: WRITE, path: /^\/api\/grievances\/(?!request)/, permission: "grievances.resolve" },

  { methods: /^(PUT|PATCH)$/, path: /^\/api\/attendance\/records\//, permission: "attendance.edit" },
  { methods: WRITE, path: /^\/api\/attendance\/change-requests\/[^/]+\/decide/, permission: "requests.decide" },
  { methods: WRITE, path: /^\/api\/attendance\/time-off\/leaves\/[^/]+\/process/, permission: "requests.decide" },
  { methods: WRITE, path: /^\/api\/attendance\/marks\/[^/]+\/decide/, permission: "locations.decide" },
  { methods: WRITE, path: /^\/api\/attendance\/(locations|mark\/settings)/, permission: "locations.edit" },
  { methods: WRITE, path: /^\/api\/attendance\/shifts/, permission: "shifts.edit" },
  { methods: WRITE, path: /^\/api\/attendance\/time-off\/holidays/, permission: "holidays.edit" },
  { methods: WRITE, path: /^\/api\/daily-flow\/break-schedules/, permission: "break-scheduler.edit" },

  // Callers' own outcome / custom-field updates are never blocked.
  { methods: WRITE, path: /^\/api\/welcome-calls\/(campaigns|leads\/[^/]+\/assign)/, permission: "welcome-calls.manage" },
  { methods: WRITE, path: /^\/api\/assigned-tasks\/?$/, permission: "assigned-tasks.edit" },
  { methods: WRITE, path: /^\/api\/productivity-rules/, permission: "productivity-rules.edit" },
  { methods: WRITE, path: /^\/api\/workforce-brain/, permission: "workforce-brain.manage" },
  { methods: WRITE, path: /^\/api\/access/, permission: "__super_admin__" },
  { methods: READ, path: /^\/api\/(notifications\/email-logs|system)/, permission: "admin-controls.view" },
];

export const permissionFor = (method: string, path: string) =>
  ACTION_RULES.find((rule) => rule.methods.test(method) && rule.path.test(path))?.permission || null;
