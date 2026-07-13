"use client";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { LogOut, ChevronRight, Bell } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { useEffect, useState } from "react";
import axios from "axios";

const labelMap: Record<string, string> = {
  dashboard: "Overview",
  employees: "Employees",
  devices: "Devices",
  attendance: "Attendance",
  leaves: "Leaves",
  shifts: "Shifts",
  holidays: "Holidays",
  departments: "Departments",
  analytics: "Analytics",
  "productivity-rules": "Productivity Rules",
  "sync-errors": "System Logs",
};

function titleize(seg: string) {
  return labelMap[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const segs = pathname.split("/").filter(Boolean);
  const [unreadErrors, setUnreadErrors] = useState(0);

  useEffect(() => {
    const fetchUnreadErrors = async () => {
      try {
        const token =
          localStorage.getItem("wf_token") || localStorage.getItem("token");
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
        const res = await axios.get(
          `${API_URL}/devices/errors?unreadOnly=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setUnreadErrors(res.data.data?.errors?.length || 0);
      } catch (err) {
        // silently fail for polling
      }
    };

    fetchUnreadErrors();
    const interval = setInterval(fetchUnreadErrors, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-[5] bg-white/85 backdrop-blur border-b border-gray-200">
      <div className="px-8 h-16 flex items-center justify-between gap-6">
        <nav className="flex items-center text-sm text-gray-500 min-w-0">
          {segs.map((s, i) => (
            <span key={i} className="flex items-center min-w-0">
              {i > 0 && (
                <ChevronRight className="w-3.5 h-3.5 mx-1.5 text-gray-300 shrink-0" />
              )}
              <span
                className={
                  i === segs.length - 1
                    ? "text-gray-900 font-semibold truncate"
                    : "text-gray-500 truncate"
                }
              >
                {titleize(s)}
              </span>
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <GlobalSearch />

          <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
            <button
              onClick={() => router.push("/dashboard/sync-errors")}
              className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              title="System Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadErrors > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
              )}
            </button>

            <div className="text-right ml-2">
              <p className="text-xs font-semibold text-gray-900 leading-tight">
                {user?.name}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                {user?.role}
              </p>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm"
              style={{
                background: "linear-gradient(135deg, #4f46e5, #1e1b4b)",
              }}
            >
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
