"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, CalendarCheck, Clock, Umbrella,
  Building2, BarChart2, Settings, LogOut, ShieldCheck, Calendar,
} from "lucide-react";

const nav = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Employees", href: "/dashboard/employees", icon: Users },
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
  const { user, logout } = useAuthStore();

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-gray-900 flex flex-col z-10">
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <Settings className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">Workforce</p>
            <p className="text-xs text-gray-400 mt-0.5">Admin Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-800">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs font-medium text-white truncate">{user?.name}</p>
          <p className="text-xs text-gray-400 truncate">{user?.role}</p>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
