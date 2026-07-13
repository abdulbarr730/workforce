"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { useDailyFlowStore } from "@/store/daily-flow.store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CalendarCheck,
  Clock,
  Umbrella,
  BarChart2,
  LogOut,
  Sparkles,
} from "lucide-react";

const nav = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Attendance", href: "/dashboard/attendance", icon: CalendarCheck },
  { label: "Work Sessions", href: "/dashboard/sessions", icon: Clock },
  { label: "Leave Requests", href: "/dashboard/leaves", icon: Umbrella },
  { label: "My Analytics", href: "/dashboard/analytics", icon: BarChart2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const openModal = useDailyFlowStore((s) => s.openModal);

  return (
    <aside
      className="fixed inset-y-0 left-0 w-56 flex flex-col z-10 text-white"
      style={{
        background:
          "linear-gradient(180deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)",
      }}
    >
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: "linear-gradient(135deg,#14b8a6,#0d9488)" }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none tracking-wide">
              PROSYNC
            </p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-[0.18em]">
              My Portal
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-[0.14em]">
          My workspace
        </p>
        {nav.map(({ label, href, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
                active
                  ? "text-white font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-white/5",
              )}
              style={
                active
                  ? { background: "rgba(20,184,166,0.18)", color: "#5eead4" }
                  : {}
              }
            >
              <Icon
                className="w-4 h-4 shrink-0 transition-colors"
                style={active ? { color: "#14b8a6" } : {}}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-1 rounded-xl bg-white/5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "linear-gradient(135deg,#14b8a6,#0d9488)" }}
          >
            {user?.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate leading-none">
              {user?.name}
            </p>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {user?.employeeId}
            </p>
          </div>
        </div>
        <button
          onClick={() => openModal("eod")}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          title="Submit EOD to sign out"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
