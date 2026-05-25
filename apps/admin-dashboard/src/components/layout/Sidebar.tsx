"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, CalendarCheck, Clock, Umbrella,
  Building2, BarChart2, Calendar, ShieldCheck, Laptop, Sparkles,
} from "lucide-react";

const nav = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Employees", href: "/dashboard/employees", icon: Users },
  { label: "Devices", href: "/dashboard/devices", icon: Laptop },
  { label: "Attendance", href: "/dashboard/attendance", icon: CalendarCheck },
  { label: "Leaves", href: "/dashboard/leaves", icon: Umbrella },
  { label: "Shifts", href: "/dashboard/shifts", icon: Clock },
  { label: "Holidays", href: "/dashboard/holidays", icon: Calendar },
  { label: "Departments", href: "/dashboard/departments", icon: Building2 },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  { label: "Productivity Rules", href: "/dashboard/productivity-rules", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed inset-y-0 left-0 w-64 flex flex-col z-10 text-white"
      style={{
        background:
          "linear-gradient(180deg, #1e1b4b 0%, #312e81 60%, #1e1b4b 100%)",
      }}
    >
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
          >
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none tracking-wide">PROSYNC</p>
            <p className="text-[10px] text-indigo-200 mt-1 uppercase tracking-[0.18em]">Workforce OS</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-semibold text-indigo-300 uppercase tracking-[0.14em]">
          Workspace
        </p>
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all relative",
                active
                  ? "bg-white text-indigo-900 font-semibold shadow-sm"
                  : "text-indigo-100 hover:bg-white/10 hover:text-white"
              )}
            >
              {active && (
                <span
                  className="absolute -left-1 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r"
                  style={{ background: "#f59e0b" }}
                />
              )}
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-indigo-700" : "")} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-white/10 text-[11px] text-indigo-200">
        <div className="flex items-center justify-between">
          <span>v2.0</span>
          <span className="opacity-70">Prosync Infotech</span>
        </div>
      </div>
    </aside>
  );
}
