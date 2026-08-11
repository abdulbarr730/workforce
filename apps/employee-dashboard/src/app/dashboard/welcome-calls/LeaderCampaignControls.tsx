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
  webinarTitle: string;
  webinarRecurrence: "WEEKLY";
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
  outcomeOptions: WelcomeCallCampaign["outcomeOptions"];
  allocationSchedule: WelcomeCallCampaign["allocationSchedule"];
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

const campaignAllocationSchedule = (
  campaign: WelcomeCallCampaign,
): WelcomeCallCampaign["allocationSchedule"] => {
  const defaults: WelcomeCallCampaign["allocationSchedule"] = {
    mode: "SCHEDULED",
    dailyTime: "11:00",
    timezone: "Asia/Kolkata",
    requireAgentPresence: true,
    weeklyRunTimes: [
      ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"].map((weekday) => ({
        weekday,
        time: "11:00",
      })),
      { weekday: "FRIDAY", time: "11:00" },
      { weekday: "FRIDAY", time: "17:00" },
      { weekday: "SATURDAY", time: "10:00" },
    ],
    webinarCutoff: {
      enabled: true,
      weekday: "SATURDAY",
      time: "11:00",
    },
    postWebinarImmediate: {
      enabled: true,
      startTime: "11:00",
      memberEmployeeIds: [],
    },
  };
  const configured = campaign.allocationSchedule;
  const isLegacySchedule =
    !configured?.postWebinarImmediate?.startTime &&
    configured?.dailyTime === "09:00" &&
    configured?.webinarCutoff?.time === "11:00";
  return {
    ...defaults,
    ...(configured || {}),
    dailyTime: isLegacySchedule
      ? defaults.dailyTime
      : configured?.dailyTime || defaults.dailyTime,
    weeklyRunTimes: Array.isArray(configured?.weeklyRunTimes)
      ? configured.weeklyRunTimes
      : defaults.weeklyRunTimes,
    webinarCutoff: {
      ...defaults.webinarCutoff,
      ...(configured?.webinarCutoff || {}),
    },
    postWebinarImmediate: {
      ...defaults.postWebinarImmediate,
      ...(configured?.postWebinarImmediate || {}),
    },
  };
};

const toDraft = (campaign: WelcomeCallCampaign): CampaignDraft => ({
  name: campaign.name,
  webinarTitle: campaign.webinarTitle || campaign.name,
  webinarRecurrence: "WEEKLY",
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
  outcomeOptions: campaign.outcomeOptions?.length
    ? campaign.outcomeOptions
    : ["CONNECTED", "NOT_CONNECTED", "CALLBACK"],
  allocationSchedule: campaignAllocationSchedule(campaign),
  redistribution: {
    enabled: campaign.redistribution?.enabled !== false,
    afterDays: campaign.redistribution?.afterDays || 1,
    excludePreviousAssignee:
      campaign.redistribution?.excludePreviousAssignee !== false,
  },
  reminder: campaign.reminder,
});

export function LeaderCampaignControls({
  campaign,
  roster,
  departments,
  mode = "ALL",
}: {
  campaign: WelcomeCallCampaign;
  roster: WelcomeCallRosterMember[];
  departments: WelcomeCallDepartment[];
  mode?: "ALL" | "REPORT" | "SETTINGS";
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CampaignDraft>(() => toDraft(campaign));
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [notice, setNotice] = useState("");
  const [manualEmployeeIds, setManualEmployeeIds] = useState<string[]>([]);
  const [manualWebinarDate, setManualWebinarDate] = useState("");

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
      api.post(`/api/welcome-calls/campaigns/${campaign._id}/distribute`, {
        employeeIds: manualEmployeeIds.length ? manualEmployeeIds : undefined,
        webinarDate: manualWebinarDate || undefined,
      }),
    onSuccess: async (response) => {
      const assigned = Number(response.data.data?.assigned || 0);
      setNotice(`${assigned} pending registration(s) distributed.`);
      await Promise.all([
        reportQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["my-welcome-call-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["welcome-call-context"] }),
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
        allocationSchedule:
          update.enabled === false
            ? {
                ...current.allocationSchedule,
                postWebinarImmediate: {
                  ...current.allocationSchedule.postWebinarImmediate,
                  memberEmployeeIds:
                    current.allocationSchedule.postWebinarImmediate.memberEmployeeIds.filter(
                      (id) => id !== employeeId,
                    ),
                },
              }
            : current.allocationSchedule,
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

      {mode !== "REPORT" ? (
        <>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Pattern validity and allocation
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Select 2, 4, or everyone. An empty weekday selection means
                  every day.
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
                      reminder: {
                        ...current.reminder,
                        time: event.target.value,
                      },
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
                Reassign after days
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={form.redistribution.afterDays}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      redistribution: {
                        ...current.redistribution,
                        afterDays: Math.min(
                          30,
                          Math.max(1, Number(event.target.value)),
                        ),
                      },
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-5 border-t border-indigo-100 pt-5">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Payment accumulation schedule
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Batch registrations every morning and run an optional final
                  batch at the weekly webinar cutoff.
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <label className="text-xs font-semibold text-gray-600">
                  Assignment timing
                  <select
                    value={form.allocationSchedule.mode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          mode: event.target.value as "IMMEDIATE" | "SCHEDULED",
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="SCHEDULED">
                      Accumulate, then distribute
                    </option>
                    <option value="IMMEDIATE">Assign immediately</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Weekday batch time
                  <input
                    type="time"
                    disabled={form.allocationSchedule.mode === "IMMEDIATE"}
                    value={form.allocationSchedule.dailyTime}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          dailyTime: event.target.value,
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Timezone
                  <select
                    value={form.allocationSchedule.timezone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          timezone: event.target.value,
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Weekly webinar weekday
                  <select
                    disabled={
                      form.allocationSchedule.mode === "IMMEDIATE" ||
                      !form.allocationSchedule.webinarCutoff.enabled
                    }
                    value={form.allocationSchedule.webinarCutoff.weekday}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          webinarCutoff: {
                            ...current.allocationSchedule.webinarCutoff,
                            weekday: event.target.value,
                          },
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                  >
                    {WEEKDAYS.map(([day, label]) => (
                      <option key={day} value={day}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Weekly webinar time
                  <input
                    type="time"
                    disabled={
                      form.allocationSchedule.mode === "IMMEDIATE" ||
                      !form.allocationSchedule.webinarCutoff.enabled
                    }
                    value={form.allocationSchedule.webinarCutoff.time}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          webinarCutoff: {
                            ...current.allocationSchedule.webinarCutoff,
                            time: event.target.value,
                          },
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Post-webinar immediate starts
                  <input
                    type="time"
                    disabled={
                      form.allocationSchedule.mode === "IMMEDIATE" ||
                      !form.allocationSchedule.postWebinarImmediate.enabled
                    }
                    value={
                      form.allocationSchedule.postWebinarImmediate.startTime
                    }
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          postWebinarImmediate: {
                            ...current.allocationSchedule.postWebinarImmediate,
                            startTime: event.target.value,
                          },
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    disabled={form.allocationSchedule.mode === "IMMEDIATE"}
                    checked={form.allocationSchedule.webinarCutoff.enabled}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          webinarCutoff: {
                            ...current.allocationSchedule.webinarCutoff,
                            enabled: event.target.checked,
                          },
                        },
                      }))
                    }
                  />
                  Use this weekly webinar schedule to group registrations
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.allocationSchedule.requireAgentPresence}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          requireAgentPresence: event.target.checked,
                        },
                      }))
                    }
                  />
                  Only employees with an active Workforce work session
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    disabled={form.allocationSchedule.mode === "IMMEDIATE"}
                    checked={
                      form.allocationSchedule.postWebinarImmediate.enabled
                    }
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          postWebinarImmediate: {
                            ...current.allocationSchedule.postWebinarImmediate,
                            enabled: event.target.checked,
                          },
                        },
                      }))
                    }
                  />
                  Assign post-webinar payments immediately
                </label>
              </div>
              <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-600">
                    Automatic allocation runs
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        allocationSchedule: {
                          ...current.allocationSchedule,
                          weeklyRunTimes: [
                            ...current.allocationSchedule.weeklyRunTimes,
                            { weekday: "MONDAY", time: "11:00" },
                          ],
                        },
                      }))
                    }
                    className="rounded-lg border border-indigo-200 px-2.5 py-1 text-xs font-bold text-indigo-700"
                  >
                    + Add run
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {WEEKDAYS.map(([weekday, label]) => {
                    const enabled = form.allocationSchedule.weeklyRunTimes.some(
                      (run) => run.weekday === weekday,
                    );
                    return (
                      <label
                        key={weekday}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          enabled
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 bg-white text-gray-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              allocationSchedule: {
                                ...current.allocationSchedule,
                                weeklyRunTimes: event.target.checked
                                  ? [
                                      ...current.allocationSchedule
                                        .weeklyRunTimes,
                                      { weekday, time: "11:00" },
                                    ]
                                  : current.allocationSchedule.weeklyRunTimes.filter(
                                      (run) => run.weekday !== weekday,
                                    ),
                              },
                            }))
                          }
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  Turn a day off to prevent all automatic allocations that day.
                  Sunday is off by default; manual distribution remains
                  available.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {form.allocationSchedule.weeklyRunTimes.map((run, index) => (
                    <div
                      key={`${run.weekday}-${run.time}-${index}`}
                      className="flex gap-1"
                    >
                      <select
                        value={run.weekday}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            allocationSchedule: {
                              ...current.allocationSchedule,
                              weeklyRunTimes:
                                current.allocationSchedule.weeklyRunTimes.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, weekday: event.target.value }
                                      : item,
                                ),
                            },
                          }))
                        }
                        className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-2 text-xs"
                      >
                        {WEEKDAYS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={run.time}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            allocationSchedule: {
                              ...current.allocationSchedule,
                              weeklyRunTimes:
                                current.allocationSchedule.weeklyRunTimes.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, time: event.target.value }
                                      : item,
                                ),
                            },
                          }))
                        }
                        className="w-24 rounded-lg border border-gray-200 px-2 py-2 text-xs"
                      />
                      <button
                        type="button"
                        aria-label="Remove automatic run"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            allocationSchedule: {
                              ...current.allocationSchedule,
                              weeklyRunTimes:
                                current.allocationSchedule.weeklyRunTimes.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                            },
                          }))
                        }
                        className="rounded-lg px-2 text-rose-600 hover:bg-rose-50"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                Payments received by the weekly webinar time belong to that
                occurrence. Later payments are tagged for the following week's
                webinar. Automatic allocation times are configured above.
              </p>
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
                        setForm((current) => {
                          const departmentId = String(department._id);
                          const departmentEmployeeIds = new Set(
                            roster
                              .filter(
                                (member) =>
                                  member.departmentId === departmentId,
                              )
                              .map((member) => member.employeeId),
                          );
                          return {
                            ...current,
                            excludedDepartmentIds: event.target.checked
                              ? [...current.excludedDepartmentIds, departmentId]
                              : current.excludedDepartmentIds.filter(
                                  (id) => id !== departmentId,
                                ),
                            allocationSchedule: event.target.checked
                              ? {
                                  ...current.allocationSchedule,
                                  postWebinarImmediate: {
                                    ...current.allocationSchedule
                                      .postWebinarImmediate,
                                    memberEmployeeIds:
                                      current.allocationSchedule.postWebinarImmediate.memberEmployeeIds.filter(
                                        (id) => !departmentEmployeeIds.has(id),
                                      ),
                                  },
                                }
                              : current.allocationSchedule,
                          };
                        })
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
                    setForm((current) => ({
                      ...current,
                      memberRules: [],
                      allocationSchedule: {
                        ...current.allocationSchedule,
                        postWebinarImmediate: {
                          ...current.allocationSchedule.postWebinarImmediate,
                          memberEmployeeIds: [],
                        },
                      },
                    }))
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
                                        : [
                                            ...(rule?.eligibleWeekdays || []),
                                            day,
                                          ],
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
                              !rule?.enabled ||
                              form.distributionMode !== "WEIGHTED"
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
            <div className="border-t border-indigo-100 bg-indigo-50/50 p-5">
              <h3 className="text-sm font-bold text-indigo-950">
                Fixed post-webinar team
              </h3>
              <p className="mt-1 text-xs text-indigo-700">
                After the webinar time, new payments go immediately only to
                these people when their Workforce Agent is present. Existing
                assignments remain unchanged.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {roster
                  .filter((member) => ruleMap.get(member.employeeId)?.enabled)
                  .map((member) => {
                    const rule = ruleMap.get(member.employeeId);
                    const excluded = Boolean(
                      member.departmentId &&
                      form.excludedDepartmentIds.includes(member.departmentId),
                    );
                    const available = Boolean(rule?.enabled) && !excluded;
                    const selected =
                      form.allocationSchedule.postWebinarImmediate.memberEmployeeIds.includes(
                        member.employeeId,
                      );
                    return (
                      <label
                        key={member.employeeId}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${selected ? "border-indigo-300 bg-white text-indigo-800" : "border-gray-200 bg-white/70 text-gray-500"} ${available ? "cursor-pointer" : "opacity-45"}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!available}
                          checked={selected}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              allocationSchedule: {
                                ...current.allocationSchedule,
                                postWebinarImmediate: {
                                  ...current.allocationSchedule
                                    .postWebinarImmediate,
                                  memberEmployeeIds: event.target.checked
                                    ? [
                                        ...current.allocationSchedule
                                          .postWebinarImmediate
                                          .memberEmployeeIds,
                                        member.employeeId,
                                      ]
                                    : current.allocationSchedule.postWebinarImmediate.memberEmployeeIds.filter(
                                        (id) => id !== member.employeeId,
                                      ),
                                },
                              },
                            }))
                          }
                        />
                        {member.name}
                      </label>
                    );
                  })}
              </div>
              {form.allocationSchedule.postWebinarImmediate.enabled &&
              form.allocationSchedule.postWebinarImmediate.memberEmployeeIds
                .length === 0 ? (
                <p className="mt-3 text-xs font-semibold text-amber-700">
                  Select at least one enabled member or these registrations will
                  remain accumulated for manual distribution.
                </p>
              ) : null}
            </div>
            {saveMutation.isError ? (
              <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-xs text-red-700">
                {(saveMutation.error as any)?.response?.data?.message ||
                  "The pattern could not be saved."}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {mode !== "SETTINGS" ? (
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

          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-bold text-gray-700">
              Manual allocation team (may include absent or on-leave employees)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {roster.map((member) => {
                const selected = manualEmployeeIds.includes(member.employeeId);
                return (
                  <button
                    key={member.employeeId}
                    type="button"
                    onClick={() =>
                      setManualEmployeeIds((current) =>
                        selected
                          ? current.filter((id) => id !== member.employeeId)
                          : [...current, member.employeeId],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      selected
                        ? "border-indigo-500 bg-indigo-600 text-white"
                        : "border-gray-200 bg-white text-gray-600"
                    }`}
                  >
                    {member.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              With no selection, all configured campaign members are used.
            </p>
            <label className="mt-3 block max-w-xs text-xs font-semibold text-gray-600">
              Allocate only registrations for webinar
              <input
                type="date"
                value={manualWebinarDate}
                onChange={(event) => setManualWebinarDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[11px] font-normal text-gray-500">
                Leave blank to include all unassigned webinar registrations.
              </span>
            </label>
          </div>

          {report ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ["Registrations", report.totals.registrations],
                  ["Accumulated", report.totals.unassigned],
                  ["Connected", report.totals.connected],
                  ["Not connected", report.totals.notConnected],
                  ["Connection rate", `${report.totals.connectionRate}%`],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl bg-gray-50 p-3"
                  >
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
      ) : null}
    </div>
  );
}
