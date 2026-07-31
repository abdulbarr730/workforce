"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  MessageSquareWarning,
  FileText,
} from "lucide-react";

const baseNav = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Daily Logs", href: "/dashboard/history", icon: FileText },
  { label: "Attendance", href: "/dashboard/attendance", icon: CalendarCheck },
  { label: "Leave Requests", href: "/dashboard/leaves", icon: Umbrella },
  { label: "Grievances", href: "/dashboard/grievances", icon: MessageSquareWarning },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const openModal = useDailyFlowStore((s) => s.openModal);

  const handleSignOut = () => {
    logout();
    router.push("/login");
  };

  const nav = [...baseNav];
  if (user?.role === "MANAGER") {
    nav.push({ label: "Team Analytics", href: "/dashboard/team-analytics", icon: BarChart2 });
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 w-56 flex flex-col z-10 text-white"
      style={{ background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)" }}
    >
      <div className="flex items-center gap-3 px-6 h-16 shrink-0 border-b border-white/10">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
          style={{ background: "linear-gradient(135deg,#14b8a6,#0d9488)" }}
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
          Prosync
        </span>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                active
                  ? "text-white bg-white/10 shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
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
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          title="Sign out of dashboard"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
