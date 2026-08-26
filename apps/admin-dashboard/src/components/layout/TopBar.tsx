"use client";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import {
  LogOut,
  ChevronRight,
  Bell,
  CheckCheck,
  FilePenLine,
  Umbrella,
  AlertTriangle,
} from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminNotification,
  useAdminNotifications,
} from "@/hooks/use-admin-notifications";

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
  "welcome-calls": "Welcome Calls",
};

function titleize(seg: string) {
  return labelMap[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
}

export function TopBar() {
  const rawPathname = usePathname();
  const pathname = rawPathname || "";
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const segs = pathname.split("/").filter(Boolean);
  const [unreadErrors, setUnreadErrors] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const {
    data: notificationData,
    markRead,
    markAllRead,
    refresh: refreshNotifications,
  } = useAdminNotifications();
  const unreadNotifications = user?.employeeId
    ? notificationData.notifications.filter(
        (notification) => !notification.readBy?.includes(user.employeeId),
      )
    : [];
  const totalUnread = notificationData.unreadCount + unreadErrors;

  const markDeviceErrorsRead = async () => {
    if (unreadErrors === 0) return;
    await api.put("/api/devices/errors/mark-read");
    setUnreadErrors(0);
  };

  const markEverythingSeen = async () => {
    await Promise.allSettled([
      notificationData.unreadCount > 0 ? markAllRead() : Promise.resolve(),
      markDeviceErrorsRead(),
    ]);
    await refreshNotifications();
  };

  const openNotification = async (notification: AdminNotification) => {
    try {
      await markRead(notification._id);
    } catch {}
    const separator = notification.deepLink.includes("?") ? "&" : "?";
    setNotificationsOpen(false);
    router.push(
      `${notification.deepLink}${separator}notification=${notification._id}`,
    );
  };

  useEffect(() => {
    const fetchUnreadErrors = async () => {
      try {
        const res = await api.get("/api/devices/errors?unreadOnly=true");
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
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                title="Notifications"
                aria-label="Open notifications"
                aria-expanded={notificationsOpen}
              >
                <Bell className="w-5 h-5" />
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 max-w-8 h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full ring-2 ring-white flex items-center justify-center tabular-nums">
                    {totalUnread}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-11 z-50 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        Notifications
                      </p>
                      <p className="text-xs text-gray-500">
                        {totalUnread} unread item
                        {totalUnread === 1 ? "" : "s"}
                      </p>
                    </div>
                    {totalUnread > 0 && (
                      <button
                        onClick={() => void markEverythingSeen()}
                        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-[28rem] overflow-y-auto">
                    {unreadNotifications.length === 0 &&
                      unreadErrors === 0 && (
                        <p className="px-4 py-10 text-center text-sm text-gray-500">
                          No notifications yet.
                        </p>
                      )}
                    {unreadNotifications.map((notification) => {
                      const unread = user?.employeeId
                        ? !notification.readBy?.includes(user.employeeId)
                        : false;
                      const Icon =
                        notification.entityType === "LEAVE"
                          ? Umbrella
                          : FilePenLine;
                      return (
                        <button
                          key={notification._id}
                          onClick={() => openNotification(notification)}
                          className={`flex w-full gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${unread ? "bg-red-50/50" : "bg-white"}`}
                        >
                          <span
                            className={`mt-0.5 rounded-lg p-2 ${notification.entityType === "LEAVE" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold text-gray-900">
                                {notification.title}
                              </span>
                              {unread && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-gray-600">
                              {notification.message}
                            </span>
                            {notification.reason && (
                              <span className="mt-1 block truncate text-[11px] text-gray-500">
                                Reason: {notification.reason}
                              </span>
                            )}
                            <span className="mt-1 block text-[10px] text-gray-400">
                              {new Date(
                                notification.createdAt,
                              ).toLocaleString()}
                            </span>
                          </span>
                        </button>
                      );
                    })}

                    {unreadErrors > 0 && (
                      <button
                        onClick={async () => {
                          await markDeviceErrorsRead().catch(() => undefined);
                          setNotificationsOpen(false);
                          router.push("/dashboard/sync-errors?focus=device");
                        }}
                        className="flex w-full gap-3 bg-amber-50/50 px-4 py-3 text-left hover:bg-amber-50"
                      >
                        <span className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">
                            {unreadErrors} device sync error
                            {unreadErrors === 1 ? "" : "s"}
                          </span>
                          <span className="text-xs text-gray-600">
                            Open system logs
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

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
