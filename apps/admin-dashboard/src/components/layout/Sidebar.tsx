"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Clock,
  Umbrella,
  Building2,
  BarChart2,
  Calendar,
  ShieldCheck,
  Laptop,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

const nav = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Employees", href: "/dashboard/employees", icon: Users },
  { label: "Devices", href: "/dashboard/devices", icon: Laptop },
  { label: "Attendance", href: "/dashboard/attendance", icon: CalendarCheck },
  { label: "Leaves", href: "/dashboard/leaves", icon: Umbrella },
  { label: "Shifts", href: "/dashboard/shifts", icon: Clock },
  { label: "Holidays", href: "/dashboard/holidays", icon: Calendar },
  { label: "Departments", href: "/dashboard/departments", icon: Building2 },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart2 },
  {
    label: "EOD and Todo list",
    href: "/dashboard/daily-reports",
    icon: CalendarCheck,
  },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  {
    label: "Productivity Rules",
    href: "/dashboard/productivity-rules",
    icon: ShieldCheck,
  },
  { label: "Sync Errors", href: "/dashboard/sync-errors", icon: AlertTriangle },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const filteredNav = nav.filter((item) => {
    if (user?.role === "ADMIN") {
      return [
        "Overview",
        "Employees",
        "Devices",
        "Attendance",
        "Shifts",
        "Departments",
        "Reports",
        "Analytics",
        "EOD and Todo list",
        "Productivity Rules",
        "Sync Errors",
      ].includes(item.label);
    }
    return true;
  });

  return (
    <aside
      className="fixed inset-y-0 left-0 w-64 flex flex-col z-10 text-white"
      style={{
        background: "#232F3E",
        borderRight: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: "linear-gradient(135deg, #FF9900, #E68A00)" }}
          >
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none tracking-wide">
              PROSYNC
            </p>
            <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-[0.18em]">
              Workforce OS
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-[0.14em]">
          Workspace
        </p>
        {filteredNav.map(({ label, href, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all relative",
                active
                  ? "bg-white text-[#232F3E] font-semibold shadow-sm"
                  : "text-gray-300 hover:bg-white/10 hover:text-white",
              )}
            >
              {active && (
                <span
                  className="absolute -left-1 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r"
                  style={{ background: "#FF9900" }}
                />
              )}
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0",
                  active ? "text-[#FF9900]" : "",
                )}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-white/10 text-[11px] text-gray-400">
        <div className="flex items-center justify-between">
          <span>v2.0</span>
          <span className="opacity-70">Prosync Infotech</span>
        </div>
      </div>
    </aside>
  );
}
