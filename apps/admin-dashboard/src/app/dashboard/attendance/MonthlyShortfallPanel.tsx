"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

type ShortfallDay = {
  date: string;
  attendanceStatus: string;
  shiftAssigned: string;
  requiredMinutes: number;
  workedMinutes: number;
  shortfallMinutes: number;
  creditMinutes: number;
  excludedAsOpenShift: boolean;
};

type ShortfallEmployee = {
  employeeId: string;
  employeeName: string;
  departmentName: string;
  assignedShiftPolicyName?: string | null;
  requiredMinutes: number;
  workedMinutes: number;
  rawShortfallMinutes: number;
  coveredByResetMinutes: number;
  totalResetMinutes: number;
  shortfallMinutes: number;
  surplusMinutes: number;
  deficitDays: number;
  recordedDays: number;
  excludedOpenDays: number;
  daily: ShortfallDay[];
  resetHistory: Array<{
    id: string;
    appliedMinutes: number;
    reason: string;
    resetByName: string;
    createdAt: string;
  }>;
};

type ShortfallResponse = {
  month: string;
  totals: {
    employees: number;
    employeesWithShortfall: number;
    requiredMinutes: number;
    workedMinutes: number;
    shortfallMinutes: number;
    coveredByResetMinutes: number;
  };
  employees: ShortfallEmployee[];
};

const durationLabel = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export function MonthlyShortfallPanel({
  month,
  employeeId,
  canReset,
}: {
  month: string;
  employeeId?: string;
  canReset: boolean;
}) {
  const queryClient = useQueryClient();
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(
    null,
  );
  const [showOnlyShortfalls, setShowOnlyShortfalls] = useState(true);
  const [resetTarget, setResetTarget] = useState<ShortfallEmployee | null>(
    null,
  );
  const [resetReason, setResetReason] = useState("");

  const query = useQuery({
    queryKey: ["attendance-shortfall", month, employeeId || "all"],
    queryFn: () => {
      const params = new URLSearchParams({ month });
      if (employeeId) params.set("employeeId", employeeId);
      return api
        .get(`/api/attendance/shortfall?${params.toString()}`)
        .then((response) => response.data.data as ShortfallResponse);
    },
    staleTime: 30_000,
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      api.post("/api/attendance/shortfall/reset", {
        employeeId: resetTarget?.employeeId,
        month,
        reason: resetReason.trim(),
      }),
    onSuccess: async () => {
      setResetTarget(null);
      setResetReason("");
      await queryClient.invalidateQueries({
        queryKey: ["attendance-shortfall"],
      });
    },
  });

  if (query.isLoading) {
    return (
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-400">
        Calculating monthly hour balances…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Monthly shortfall could not be loaded.
      </div>
    );
  }

  const { totals } = query.data;
  const employees = showOnlyShortfalls
    ? query.data.employees.filter((employee) => employee.shortfallMinutes > 0)
    : query.data.employees;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Monthly Hours
            Shortfall
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Net required policy time minus tracked work. Extra tracked hours
            automatically cover deficits; open shifts are excluded.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input
            type="checkbox"
            checked={showOnlyShortfalls}
            onChange={(event) => setShowOnlyShortfalls(event.target.checked)}
            className="h-4 w-4 accent-gray-900"
          />
          Only employees with shortfall
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-gray-100 bg-gray-50/70 p-4 md:grid-cols-4">
        {[
          ["Employees owing hours", String(totals.employeesWithShortfall)],
          ["Hours still to cover", durationLabel(totals.shortfallMinutes)],
          ["Required", durationLabel(totals.requiredMinutes)],
          ["Tracked work", durationLabel(totals.workedMinutes)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-gray-200 bg-white p-3"
          >
            <p className="text-lg font-semibold text-gray-900">{value}</p>
            <p className="mt-0.5 text-[11px] font-medium text-gray-500">
              {label}
            </p>
          </div>
        ))}
      </div>

      {employees.length === 0 ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5" /> No outstanding shortfall for this
          selection.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                {[
                  "Employee",
                  "Department",
                  "Required",
                  "Tracked",
                  "Raw balance",
                  "Admin covered",
                  "Still to cover",
                  "Deficit days",
                  "Details",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const isExpanded = expandedEmployeeId === employee.employeeId;
                return (
                  <tr
                    key={employee.employeeId}
                    className="border-b border-gray-100"
                  >
                    <td colSpan={9} className="p-0">
                      <div className="grid grid-cols-[1.4fr_1.2fr_repeat(6,1fr)_80px] items-center">
                        <div className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">
                            {employee.employeeName}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {employee.employeeId}
                          </p>
                        </div>
                        <div className="px-4 py-3 text-xs text-gray-600">
                          {employee.departmentName}
                        </div>
                        <div className="px-4 py-3 text-xs text-gray-700">
                          {durationLabel(employee.requiredMinutes)}
                        </div>
                        <div className="px-4 py-3 text-xs text-gray-700">
                          {durationLabel(employee.workedMinutes)}
                        </div>
                        <div className="px-4 py-3 text-xs text-gray-700">
                          {durationLabel(employee.rawShortfallMinutes)}
                        </div>
                        <div className="px-4 py-3 text-xs text-indigo-700">
                          {durationLabel(employee.coveredByResetMinutes)}
                        </div>
                        <div className="px-4 py-3 text-sm font-bold text-rose-600">
                          {durationLabel(employee.shortfallMinutes)}
                        </div>
                        <div className="px-4 py-3 text-xs text-gray-700">
                          {employee.deficitDays}
                        </div>
                        <div className="flex items-center justify-end gap-1 px-3 py-3">
                          {canReset && employee.shortfallMinutes > 0 ? (
                            <button
                              type="button"
                              onClick={() => setResetTarget(employee)}
                              className="rounded-md border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100"
                              title="Reset this employee's outstanding monthly shortfall"
                              aria-label={`Reset shortfall for ${employee.employeeName}`}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedEmployeeId(
                                isExpanded ? null : employee.employeeId,
                              )
                            }
                            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
                            aria-label={`${isExpanded ? "Hide" : "Show"} details for ${employee.employeeName}`}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-4">
                          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                              <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                                Daily calculation
                              </div>
                              <div className="max-h-64 overflow-y-auto">
                                {employee.daily.map((day) => (
                                  <div
                                    key={day.date}
                                    className="grid grid-cols-[100px_1fr_repeat(3,90px)] gap-2 border-b border-gray-50 px-3 py-2 text-[11px] last:border-0"
                                  >
                                    <span className="font-medium text-gray-700">
                                      {day.date}
                                    </span>
                                    <span className="truncate text-gray-500">
                                      {day.excludedAsOpenShift
                                        ? "Open shift — excluded"
                                        : day.shiftAssigned ||
                                          day.attendanceStatus}
                                    </span>
                                    <span>
                                      Req. {durationLabel(day.requiredMinutes)}
                                    </span>
                                    <span>
                                      Work {durationLabel(day.workedMinutes)}
                                    </span>
                                    <span
                                      className={
                                        day.shortfallMinutes > 0
                                          ? "font-semibold text-rose-600"
                                          : "text-emerald-600"
                                      }
                                    >
                                      {day.shortfallMinutes > 0
                                        ? `-${durationLabel(day.shortfallMinutes)}`
                                        : day.creditMinutes > 0
                                          ? `+${durationLabel(day.creditMinutes)}`
                                          : "Balanced"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <p className="text-xs font-semibold text-gray-700">
                                Reset history
                              </p>
                              {employee.resetHistory.length > 0 ? (
                                <div className="mt-2 space-y-2">
                                  {employee.resetHistory.map((reset) => (
                                    <div
                                      key={reset.id}
                                      className="rounded-md border border-indigo-100 bg-indigo-50 p-2 text-[11px] text-indigo-900"
                                    >
                                      <p className="font-semibold">
                                        {durationLabel(reset.appliedMinutes)}{" "}
                                        covered by {reset.resetByName}
                                      </p>
                                      <p className="mt-0.5">{reset.reason}</p>
                                      <p className="mt-1 text-indigo-500">
                                        {new Date(
                                          reset.createdAt,
                                        ).toLocaleString()}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-[11px] text-gray-400">
                                  No admin reset recorded.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resetTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Reset monthly shortfall
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {resetTarget.employeeName} currently has{" "}
                  {durationLabel(resetTarget.shortfallMinutes)} to cover for{" "}
                  {month}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
                aria-label="Close reset dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-gray-700">
              Reset reason
              <textarea
                value={resetReason}
                onChange={(event) => setResetReason(event.target.value)}
                rows={3}
                placeholder="Why is this balance being cleared?"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </label>
            {resetMutation.isError ? (
              <p className="mt-2 text-xs text-red-600">
                {(resetMutation.error as any)?.response?.data?.message ||
                  "Reset failed."}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => resetMutation.mutate()}
                disabled={
                  resetReason.trim().length < 3 || resetMutation.isPending
                }
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {resetMutation.isPending ? "Resetting…" : "Reset balance"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
