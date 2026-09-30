"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

export type AttendanceChange = {
  id: string;
  date: string;
  at: string;
  source: "ADMIN" | "REQUEST";
  byName: string;
  reason: string;
  changes: string[];
  seen: boolean;
};

export const useMyAttendanceChanges = () => {
  const user = useAuthStore((s) => s.user);
  return useQuery<{ changes: AttendanceChange[]; unseen: number }>({
    queryKey: ["my-attendance-changes", user?.employeeId],
    queryFn: () => api.get("/api/attendance/my-changes").then((r) => r.data.data),
    enabled: !!user,
    refetchInterval: 120_000,
  });
};

const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/**
 * Changes an admin made to the employee's attendance that the employee did
 * not ask for. Stays until the employee presses "Got it".
 */
export function AttendanceChangesNotice() {
  const qc = useQueryClient();
  const { data } = useMyAttendanceChanges();
  const markSeen = useMutation({
    mutationFn: () => api.patch("/api/attendance/my-changes/seen", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-attendance-changes"] }),
  });
  const unseen = (data?.changes || []).filter((c) => !c.seen);
  if (!unseen.length) return null;

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <h2 className="font-bold text-amber-900">Your attendance was changed by an admin</h2>
          <p className="mt-0.5 text-sm text-amber-800">
            You did not request these changes. If something is wrong, contact your admin.
          </p>
          <ul className="mt-3 space-y-2">
            {unseen.map((change) => (
              <li key={change.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm">
                <div className="font-semibold text-slate-900">
                  {formatDay(change.date)} · changed by {change.byName}
                </div>
                {change.changes.map((line) => (
                  <div key={line} className="text-slate-700">{line}</div>
                ))}
                {change.reason ? (
                  <div className="text-xs text-slate-500">Reason: {change.reason}</div>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => markSeen.mutate()}
              disabled={markSeen.isPending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Got it
            </button>
            <Link
              href="/dashboard/requests?tab=changes"
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800"
            >
              See all changes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
