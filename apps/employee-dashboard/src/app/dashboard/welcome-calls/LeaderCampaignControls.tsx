"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw, Save, Users } from "lucide-react";
import type {
  WelcomeCallCampaign,
  WelcomeCallReport,
} from "@workforce/shared-types";
import { api } from "@/lib/api";

export type WelcomeCallRosterMember = {
  employeeId: string;
  name: string;
  role: string;
  departmentId?: string | null;
  departmentName?: string | null;
};

export type WelcomeCallDepartment = {
  _id: string;
  name: string;
};

type RuleDraft = {
  employeeId: string;
  enabled: boolean;
  eligibleWeekdays: string[];
  weight: number;
  dailyCap: number | null;
};

type CampaignDraft = {
  name: string;
  key: string;
  registrationAmount: number;
  currency: string;
  isActive: boolean;
  distributionMode: "EQUAL" | "WEIGHTED";
  patternDuration: "WEEK" | "MONTH" | "UNTIL_CHANGED";
  effectiveFrom: string;
  responsibleEmployeeIds: string[];
  memberRules: RuleDraft[];
  excludedDepartmentIds: string[];
  redistribution: WelcomeCallCampaign["redistribution"];
  reminder: WelcomeCallCampaign["reminder"];
};

const WEEKDAYS = [
  ["MONDAY", "Mon"],
  ["TUESDAY", "Tue"],
  ["WEDNESDAY", "Wed"],
  ["THURSDAY", "Thu"],
  ["FRIDAY", "Fri"],
  ["SATURDAY", "Sat"],
  ["SUNDAY", "Sun"],
] as const;

const today = () => {
  const current = new Date();
  const local = new Date(
    current.getTime() - current.getTimezoneOffset() * 60_000,
  );
  return local.toISOString().slice(0, 10);
};

const toDraft = (campaign: WelcomeCallCampaign): CampaignDraft => ({
  name: campaign.name,
  key: campaign.key,
  registrationAmount: campaign.registrationAmount,
  currency: campaign.currency,
  isActive: campaign.isActive,
  distributionMode: campaign.distributionMode,
  patternDuration: campaign.patternDuration,
  effectiveFrom: campaign.effectiveFrom,
  responsibleEmployeeIds: campaign.responsiblePeople.map(
    (person) => person.employeeId,
  ),
  memberRules: campaign.memberRules.map((rule) => ({
    employeeId: rule.employeeId,
    enabled: rule.enabled,
    eligibleWeekdays: rule.eligibleWeekdays,
    weight: rule.weight,
    dailyCap: rule.dailyCap || null,
  })),
  excludedDepartmentIds: campaign.excludedDepartmentIds,
  redistribution: campaign.redistribution,
  reminder: campaign.reminder,
});

export function LeaderCampaignControls({
  campaign,
  roster,
  departments,
}: {
  campaign: WelcomeCallCampaign;
  roster: WelcomeCallRosterMember[];
  departments: WelcomeCallDepartment[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CampaignDraft>(() => toDraft(campaign));
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [notice, setNotice] = useState("");

  useEffect(() => setForm(toDraft(campaign)), [campaign]);

  const ruleMap = useMemo(
    () => new Map(form.memberRules.map((rule) => [rule.employeeId, rule])),
    [form.memberRules],
  );

  const reportQuery = useQuery({
    queryKey: ["welcome-call-team-report", campaign._id, dateFrom, dateTo],
    queryFn: () =>
      api
        .get(
          `/api/welcome-calls/campaigns/${campaign._id}/report?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        )
        .then((response) => response.data.data as WelcomeCallReport),
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/welcome-calls/campaigns/${campaign._id}`, form),
    onSuccess: async () => {
      setNotice("Distribution pattern and reminders saved.");
      await queryClient.invalidateQueries({
        queryKey: ["welcome-call-context"],
      });
    },
  });

  const distributeMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/welcome-calls/campaigns/${campaign._id}/distribute`),
    onSuccess: async (response) => {
      const assigned = Number(response.data.data?.assigned || 0);
      setNotice(`${assigned} pending registration(s) distributed.`);
      await Promise.all([
        reportQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["my-welcome-call-queue"] }),
      ]);
    },
  });

  const updateRule = (employeeId: string, update: Partial<RuleDraft>) => {
    setForm((current) => {
      const existing = current.memberRules.find(
        (rule) => rule.employeeId === employeeId,
      ) || {
        employeeId,
        enabled: false,
        eligibleWeekdays: [],
        weight: 1,
        dailyCap: null,
      };
      return {
        ...current,
        memberRules: [
          ...current.memberRules.filter(
            (rule) => rule.employeeId !== employeeId,
          ),
          { ...existing, ...update },
        ],
      };
    });
  };

  const exportWorkbook = async () => {
    const response = await api.get(
      `/api/welcome-calls/campaigns/${campaign._id}/export?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${campaign.key}-${dateFrom}-to-${dateTo}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const report = reportQuery.data;

  return (
    <div className="space-y-5">
      {notice ? (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Pattern validity and allocation
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Select 2, 4, or everyone. An empty weekday selection means every
              day.
            </p>
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving..." : "Save pattern"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-gray-600">
            Pattern duration
            <select
              value={form.patternDuration}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  patternDuration: event.target
                    .value as CampaignDraft["patternDuration"],
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="WEEK">One week</option>
              <option value="MONTH">One month</option>
              <option value="UNTIL_CHANGED">Until changed</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Effective from
            <input
              type="date"
              value={form.effectiveFrom}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  effectiveFrom: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Distribution
            <select
              value={form.distributionMode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  distributionMode: event.target
                    .value as CampaignDraft["distributionMode"],
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="EQUAL">Equal</option>
              <option value="WEIGHTED">Weighted</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Reminder time
            <input
              type="time"
              value={form.reminder.time}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reminder: { ...current.reminder, time: event.target.value },
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.reminder.enabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reminder: {
                    ...current.reminder,
                    enabled: event.target.checked,
                  },
                }))
              }
            />
            Remind when calls are pending
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Reminder repeats
            <select
              value={form.reminder.frequency}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reminder: {
                    ...current.reminder,
                    frequency: event.target.value as "DAILY" | "ONCE",
                  },
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="DAILY">Every day</option>
              <option value="ONCE">Once per pattern change</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.redistribution.enabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  redistribution: {
                    ...current.redistribution,
                    enabled: event.target.checked,
                  },
                }))
              }
            />
            Reassign not-connected calls
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Reassign after attempts
            <input
              type="number"
              min="1"
              value={form.redistribution.afterAttempts}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  redistribution: {
                    ...current.redistribution,
                    afterAttempts: Math.max(1, Number(event.target.value)),
                  },
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
            Excluded departments
          </p>
          <div className="flex flex-wrap gap-2">
            {departments.map((department) => (
              <label
                key={department._id}
                className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={form.excludedDepartmentIds.includes(
                    String(department._id),
                  )}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      excludedDepartmentIds: event.target.checked
                        ? [
                            ...current.excludedDepartmentIds,
                            String(department._id),
                          ]
                        : current.excludedDepartmentIds.filter(
                            (id) => id !== String(department._id),
                          ),
                    }))
                  }
                />
                {department.name}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-600" />
            <div>
              <h2 className="font-bold text-gray-900">
                People receiving calls
              </h2>
              <p className="text-xs text-gray-500">
                Choose any size and set team-specific weekdays.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                roster.forEach((member) =>
                  updateRule(member.employeeId, { enabled: true }),
                )
              }
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600"
            >
              Whole team
            </button>
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({ ...current, memberRules: [] }))
              }
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-500"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Use</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Eligible weekdays</th>
                <th className="px-4 py-3">Weight</th>
                <th className="px-4 py-3">Daily cap</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((member) => {
                const rule = ruleMap.get(member.employeeId);
                const excluded = Boolean(
                  member.departmentId &&
                  form.excludedDepartmentIds.includes(member.departmentId),
                );
                return (
                  <tr
                    key={member.employeeId}
                    className="border-t border-gray-100"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(rule?.enabled)}
                        disabled={excluded}
                        onChange={(event) =>
                          updateRule(member.employeeId, {
                            enabled: event.target.checked,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">
                        {member.name}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {member.departmentName || "No department"}
                        {excluded ? " · excluded" : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {WEEKDAYS.map(([day, label]) => (
                          <button
                            key={day}
                            type="button"
                            disabled={!rule?.enabled}
                            onClick={() =>
                              updateRule(member.employeeId, {
                                eligibleWeekdays:
                                  rule?.eligibleWeekdays.includes(day)
                                    ? rule.eligibleWeekdays.filter(
                                        (value) => value !== day,
                                      )
                                    : [...(rule?.eligibleWeekdays || []), day],
                              })
                            }
                            className={`rounded px-1.5 py-1 text-[10px] font-bold ${rule?.eligibleWeekdays.includes(day) ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-500"} disabled:opacity-40`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="1"
                        disabled={
                          !rule?.enabled || form.distributionMode !== "WEIGHTED"
                        }
                        value={rule?.weight || 1}
                        onChange={(event) =>
                          updateRule(member.employeeId, {
                            weight: Math.max(1, Number(event.target.value)),
                          })
                        }
                        className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm disabled:bg-gray-50"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="1"
                        placeholder="No cap"
                        disabled={!rule?.enabled}
                        value={rule?.dailyCap || ""}
                        onChange={(event) =>
                          updateRule(member.employeeId, {
                            dailyCap: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                        className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm disabled:bg-gray-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {saveMutation.isError ? (
          <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-xs text-red-700">
            {(saveMutation.error as any)?.response?.data?.message ||
              "The pattern could not be saved."}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Connection report</h2>
            <p className="text-xs text-gray-500">
              Custom date range with an Excel-ready detailed export.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-bold uppercase text-gray-500">
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1 block rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-[10px] font-bold uppercase text-gray-500">
              To
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1 block rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={() => distributeMutation.mutate()}
              disabled={distributeMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Distribute pending
            </button>
            <button
              type="button"
              onClick={() => void exportWorkbook()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white"
            >
              <Download className="h-3.5 w-3.5" /> Export Excel
            </button>
          </div>
        </div>

        {report ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Registrations", report.totals.registrations],
                ["Connected", report.totals.connected],
                ["Not connected", report.totals.notConnected],
                ["Connection rate", `${report.totals.connectionRate}%`],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-gray-400">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-bold text-gray-900">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-[10px] uppercase text-gray-400">
                  <tr>
                    <th className="py-2">Agent</th>
                    <th className="py-2">Assigned</th>
                    <th className="py-2">Attempts</th>
                    <th className="py-2">Connected</th>
                    <th className="py-2">Call again</th>
                    <th className="py-2">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byAgent.map((row) => (
                    <tr
                      key={row.employeeId}
                      className="border-t border-gray-100"
                    >
                      <td className="py-2 font-semibold text-gray-800">
                        {row.employeeName}
                      </td>
                      <td className="py-2">{row.currentlyAssigned}</td>
                      <td className="py-2">{row.attempts}</td>
                      <td className="py-2">{row.connected}</td>
                      <td className="py-2">{row.callback}</td>
                      <td className="py-2 font-bold text-teal-700">
                        {row.connectionRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-5 text-sm text-gray-400">
            {reportQuery.isLoading
              ? "Loading report..."
              : "No report data is available."}
          </p>
        )}
      </section>
    </div>
  );
}
