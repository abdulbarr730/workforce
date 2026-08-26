"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Edit2, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAdminNotifications } from "@/hooks/use-admin-notifications";
import { useAuthStore } from "@/store/auth.store";

type RecentEditsProps = {
  limit?: number;
  preferUnread?: boolean;
  showHistoryToggle?: boolean;
};

export function RecentEdits({
  limit,
  preferUnread = false,
  showHistoryToggle = false,
}: RecentEditsProps = {}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { data: notificationData } = useAdminNotifications();
  const { data: recentEdits, isLoading } = useQuery({
    queryKey: ["recent-edits"],
    queryFn: () =>
      api.get("/api/daily-flow/recent-edits").then((r) => r.data.data),
  });

  const allRecentEdits = recentEdits || [];
  const unreadEdits = useMemo(() => {
    if (!preferUnread || !user?.employeeId) return [];
    return notificationData.notifications
      .filter(
        (notification) =>
          ["TODO", "EOD"].includes(notification.entityType) &&
          !notification.readBy?.includes(user.employeeId),
      )
      .map((notification) => ({
        id: notification._id,
        notificationId: notification._id,
        employeeId: notification.employeeId,
        employeeName: notification.employeeName,
        type: notification.entityType,
        date: notification.entityDate,
        editedAt: notification.createdAt,
        reason: notification.reason || notification.message,
        diff: notification.diff,
        deepLink: notification.deepLink,
        unseen: true,
      }));
  }, [notificationData.notifications, preferUnread, user?.employeeId]);

  const displayEdits =
    preferUnread && unreadEdits.length > 0 ? unreadEdits : allRecentEdits;
  const visibleEdits = !limit ? displayEdits : displayEdits.slice(0, limit);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm animate-pulse h-64">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (displayEdits.length === 0) {
    return null;
  }

  const openEdit = (edit: any) => {
    const deepLink = edit.deepLink || "/dashboard/daily-reports";
    const separator = deepLink.includes("?") ? "&" : "?";
    router.push(
      edit.notificationId
        ? `${deepLink}${separator}notification=${edit.notificationId}`
        : deepLink,
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <Edit2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {preferUnread && unreadEdits.length > 0
                ? "Latest unseen edit"
                : "Recent Edits"}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Click an edit to open that employee&apos;s EOD/Todo for the edited day.
            </p>
          </div>
        </div>
        {showHistoryToggle && displayEdits.length > (limit || 0) && (
          <button
            type="button"
            onClick={() => router.push("/dashboard/daily-reports?view=edits")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
          >
            See all edit history
          </button>
        )}
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {visibleEdits.map((edit: any) => (
          <button
            key={edit.id}
            onClick={() => openEdit(edit)}
            className="w-full bg-gray-50 p-4 rounded-xl border border-gray-100 text-left hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 text-sm">
                  {edit.employeeName}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    edit.type === "TODO"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {edit.type}
                </span>
                {edit.unseen && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                    New
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-gray-400">
                {new Date(edit.editedAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-gray-100 mt-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" /> Reason for Edit
              </p>
              <p className="text-sm text-gray-800 leading-relaxed font-medium">
                "{edit.reason}"
              </p>
            </div>
            {edit.diff &&
              (edit.diff.added?.length > 0 ||
                edit.diff.removed?.length > 0) && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <p className="rounded-lg bg-red-50 p-2 text-red-700">
                    <strong>Removed:</strong>{" "}
                    {edit.diff.removed?.join(", ") || "None"}
                  </p>
                  <p className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                    <strong>Added:</strong>{" "}
                    {edit.diff.added?.join(", ") || "None"}
                  </p>
                </div>
              )}
          </button>
        ))}
      </div>
    </div>
  );
}
