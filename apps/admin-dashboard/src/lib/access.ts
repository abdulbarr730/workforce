"use client";
import {
  AlertTriangle,
  BarChart2,
  Brain,
  Building2,
  Calendar,
  CalendarCheck,
  ClipboardList,
  Clock,
  Coffee,
  FileBarChart,
  Gauge,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Laptop,
  MapPin,
  MessageSquareWarning,
  PhoneCall,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

/** What the signed-in person may see and do (from the server). */
export type Access = {
  role: string;
  roleName: string;
  baseRole: string;
  superAdmin: boolean;
  adminPortal: boolean;
  fullAccess: boolean;
  permissions: string[];
};

export type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  page: string; // permission page key ("<page>.view"); "__owner__" = owner only; "__all__" = everyone
  badge?: "LEAVE" | "DAILY" | "BREAK";
};

export type NavGroup = { title: string; items: NavItem[] };

/** Sidebar, grouped. Page keys match the server's access catalog. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [{ label: "Overview", href: "/dashboard", icon: LayoutDashboard, page: "overview" }],
  },
  {
    title: "Employee Management",
    items: [
      { label: "Employees", href: "/dashboard/employees", icon: Users, page: "employees" },
      { label: "Departments", href: "/dashboard/departments", icon: Building2, page: "departments" },
      { label: "Devices", href: "/dashboard/devices", icon: Laptop, page: "devices" },
      { label: "Grievances", href: "/dashboard/grievances", icon: MessageSquareWarning, page: "grievances" },
      { label: "Roles & Logins", href: "/dashboard/roles", icon: UserCog, page: "__owner__" },
    ],
  },
  {
    title: "Attendance & Leave",
    items: [
      { label: "Attendance", href: "/dashboard/attendance", icon: CalendarCheck, page: "attendance" },
      { label: "Requests", href: "/dashboard/requests", icon: Inbox, page: "requests", badge: "LEAVE" },
      { label: "Locations", href: "/dashboard/locations", icon: MapPin, page: "locations" },
      { label: "Shifts", href: "/dashboard/shifts", icon: Clock, page: "shifts" },
      { label: "Holidays", href: "/dashboard/holidays", icon: Calendar, page: "holidays" },
      { label: "Break Scheduler", href: "/dashboard/break-scheduler", icon: Coffee, page: "break-scheduler", badge: "BREAK" },
    ],
  },
  {
    title: "Reports",
    items: [
      { label: "To-Do & EOD", href: "/dashboard/daily-reports", icon: ClipboardList, page: "daily-reports", badge: "DAILY" },
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2, page: "analytics" },
      { label: "Custom Reports", href: "/dashboard/reports", icon: FileBarChart, page: "reports" },
    ],
  },
  {
    title: "Work",
    items: [
      { label: "Welcome Calls", href: "/dashboard/welcome-calls", icon: PhoneCall, page: "welcome-calls" },
      { label: "Assigned Tasks", href: "/dashboard/assigned-tasks", icon: ClipboardList, page: "assigned-tasks" },
      { label: "Productivity Rules", href: "/dashboard/productivity-rules", icon: ShieldCheck, page: "productivity-rules" },
    ],
  },
  {
    title: "Admin Controls",
    items: [
      { label: "System & Costs", href: "/dashboard/admin-controls", icon: Gauge, page: "admin-controls" },
      { label: "Workforce Brain", href: "/dashboard/workforce-brain", icon: Brain, page: "workforce-brain", badge: "DAILY" },
      { label: "Sync Errors", href: "/dashboard/sync-errors", icon: AlertTriangle, page: "sync-errors" },
    ],
  },
  {
    title: "Me",
    items: [{ label: "My Account", href: "/dashboard/account", icon: KeyRound, page: "__all__" }],
  },
];

/** Pages reached from inside other pages, mapped to the page they belong to. */
const EXTRA_ROUTES: Array<{ prefix: string; page: string }> = [
  { prefix: "/dashboard/screenshots", page: "screenshots" },
  { prefix: "/dashboard/leaves", page: "requests" },
  { prefix: "/dashboard/shifts/history", page: "shifts" },
];

export const canSee = (access: Access | null, page: string) => {
  if (!access) return false;
  if (page === "__all__") return true;
  if (page === "__owner__") return access.superAdmin;
  return access.superAdmin || access.fullAccess || access.permissions.includes(`${page}.view`);
};

export const can = (access: Access | null, permission: string) =>
  Boolean(access && (access.superAdmin || access.fullAccess || access.permissions.includes(permission)));

/** The page key a route belongs to (null = not a known page). */
export const pageForPath = (path: string) => {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href === "/dashboard" ? path === "/dashboard" : path === item.href || path.startsWith(`${item.href}/`)) {
        return item.page;
      }
    }
  }
  return EXTRA_ROUTES.find((r) => path.startsWith(r.prefix))?.page || null;
};

export const firstAllowedHref = (access: Access | null) => {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) if (canSee(access, item.page)) return item.href;
  }
  return "/dashboard/account";
};

export const useAccess = () => useAuthStore((s) => s.access);

/** True if the signed-in person may do this ("employees.create", …). */
export const useCan = (permission: string) => can(useAccess(), permission);
