"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Save, TimerReset, Users } from "lucide-react";
import type {
  WelcomeCallCampaign,
  WelcomeCallMemberRule,
} from "@workforce/shared-types";

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
  code?: string | null;
};

export type CampaignConfigurationPayload = {
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
  memberRules: Array<{
    employeeId: string;
    enabled: boolean;
    eligibleWeekdays: string[];
    weight: number;
    dailyCap: number | null;
  }>;
  excludedDepartmentIds: string[];
  allocationSchedule: WelcomeCallCampaign["allocationSchedule"];
  redistribution: {
    enabled: boolean;
    afterAttempts: number;
    excludePreviousAssignee: boolean;
  };
  reminder: {
    enabled: boolean;
    time: string;
    frequency: "DAILY" | "ONCE";
  };
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

const localDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const defaultAllocationSchedule =
  (): WelcomeCallCampaign["allocationSchedule"] => ({
    mode: "SCHEDULED",
    dailyTime: "11:00",
    timezone: "Asia/Kolkata",
    requireAgentPresence: true,
    weeklyRunTimes: [
      ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "SUNDAY"].map(
        (weekday) => ({ weekday, time: "11:00" }),
      ),
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
  });

const campaignAllocationSchedule = (
  campaign?: WelcomeCallCampaign,
): WelcomeCallCampaign["allocationSchedule"] => {
  const defaults = defaultAllocationSchedule();
  const configured = campaign?.allocationSchedule;
  const isLegacySchedule =
    Boolean(configured) &&
    !configured?.postWebinarImmediate?.startTime &&
    configured?.dailyTime === "09:00" &&
    configured?.webinarCutoff?.time === "11:00";
  return {
    ...defaults,
    ...configured,
    dailyTime: isLegacySchedule
      ? defaults.dailyTime
      : configured?.dailyTime || defaults.dailyTime,
    weeklyRunTimes: configured?.weeklyRunTimes?.length
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

const emptyPayload = (): CampaignConfigurationPayload => ({
  name: "₹195 Webinar Welcome Calls",
  webinarTitle: "Weekly ₹195 Webinar",
  webinarRecurrence: "WEEKLY",
  key: "webinar-195",
  registrationAmount: 195,
  currency: "INR",
  isActive: true,
  distributionMode: "EQUAL",
  patternDuration: "UNTIL_CHANGED",
  effectiveFrom: localDate(),
  responsibleEmployeeIds: [],
  memberRules: [],
  excludedDepartmentIds: [],
  allocationSchedule: defaultAllocationSchedule(),
  redistribution: {
    enabled: true,
    afterAttempts: 1,
    excludePreviousAssignee: true,
  },
  reminder: { enabled: true, time: "16:30", frequency: "DAILY" },
});

const campaignPayload = (
  campaign: WelcomeCallCampaign,
): CampaignConfigurationPayload => ({
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
  memberRules: campaign.memberRules.map((member) => ({
    employeeId: member.employeeId,
    enabled: member.enabled,
    eligibleWeekdays: member.eligibleWeekdays,
    weight: member.weight,
    dailyCap: member.dailyCap || null,
  })),
  excludedDepartmentIds: campaign.excludedDepartmentIds,
  allocationSchedule: campaignAllocationSchedule(campaign),
  redistribution: campaign.redistribution,
  reminder: campaign.reminder,
});

export function CampaignConfigurationForm({
  campaign,
  roster,
  departments,
  canAssignResponsibility,
  saving,
  onSave,
}: {
  campaign?: WelcomeCallCampaign;
  roster: WelcomeCallRosterMember[];
  departments: WelcomeCallDepartment[];
  canAssignResponsibility: boolean;
  saving: boolean;
  onSave: (payload: CampaignConfigurationPayload) => void;
}) {
  const [form, setForm] = useState<CampaignConfigurationPayload>(emptyPayload);

  useEffect(() => {
    setForm(campaign ? campaignPayload(campaign) : emptyPayload());
  }, [campaign]);

  const rulesByEmployee = new Map(
    form.memberRules.map((rule) => [rule.employeeId, rule]),
  );

  const toggleMember = (employeeId: string, enabled: boolean) => {
    setForm((current) => {
      const existing = current.memberRules.find(
        (rule) => rule.employeeId === employeeId,
      );
      const nextRule = existing
        ? { ...existing, enabled }
        : {
            employeeId,
            enabled,
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
          nextRule,
        ],
        allocationSchedule: enabled
          ? current.allocationSchedule
          : {
              ...current.allocationSchedule,
              postWebinarImmediate: {
                ...current.allocationSchedule.postWebinarImmediate,
                memberEmployeeIds:
                  current.allocationSchedule.postWebinarImmediate.memberEmployeeIds.filter(
                    (id) => id !== employeeId,
                  ),
              },
            },
      };
    });
  };

  const updateRule = (
    employeeId: string,
    update: Partial<CampaignConfigurationPayload["memberRules"][number]>,
  ) => {
    setForm((current) => ({
      ...current,
      memberRules: current.memberRules.map((rule) =>
        rule.employeeId === employeeId ? { ...rule, ...update } : rule,
      ),
    }));
  };

  const toggleWeekday = (employeeId: string, weekday: string) => {
    const current = rulesByEmployee.get(employeeId);
    if (!current) return;
    updateRule(employeeId, {
      eligibleWeekdays: current.eligibleWeekdays.includes(weekday)
        ? current.eligibleWeekdays.filter((day) => day !== weekday)
        : [...current.eligibleWeekdays, weekday],
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(form);
      }}
      className="space-y-6"
    >
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="font-bold text-gray-900">Campaign and validity</h2>
            <p className="text-xs text-gray-500">
              Apply this pattern for one week, one month, or until someone
              changes it.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-gray-600">
            Campaign name
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Which webinar is this?
            <input
              required
              value={form.webinarTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  webinarTitle: event.target.value,
                }))
              }
              placeholder="e.g. Saturday ₹195 Amazon Webinar"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Webhook key
            <input
              required
              disabled={Boolean(campaign)}
              value={form.key}
              onChange={(event) =>
                setForm((current) => ({ ...current, key: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Registration amount
            <input
              required
              type="number"
              min="0"
              value={form.registrationAmount}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  registrationAmount: Number(event.target.value),
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Configuration validity
            <select
              value={form.patternDuration}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  patternDuration: event.target
                    .value as CampaignConfigurationPayload["patternDuration"],
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
            Webinar recurrence
            <select
              value={form.webinarRecurrence}
              disabled
              className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
            >
              <option value="WEEKLY">Every week</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Effective from
            <input
              type="date"
              required
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
                  distributionMode: event.target.value as "EQUAL" | "WEIGHTED",
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="EQUAL">Equal across selected people</option>
              <option value="WEIGHTED">Weighted shares</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
            />
            Campaign active
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <TimerReset className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="font-bold text-gray-900">
              Registration accumulation and allocation time
            </h2>
            <p className="text-xs text-gray-500">
              Hold Pabbly payments in a pool, then distribute them in one fair
              batch each morning. The webinar cutoff catches late Saturday
              registrations.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="SCHEDULED">Accumulate, then distribute</option>
              <option value="IMMEDIATE">
                Assign every payment immediately
              </option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Daily distribution time
            <input
              type="time"
              required
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
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
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
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
            >
              {WEEKDAYS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Weekly webinar time
            <input
              type="time"
              required
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
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Post-webinar immediate starts
            <input
              type="time"
              required
              disabled={
                form.allocationSchedule.mode === "IMMEDIATE" ||
                !form.allocationSchedule.postWebinarImmediate.enabled
              }
              value={form.allocationSchedule.postWebinarImmediate.startTime}
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
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
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
            Automatically assign only to people with an active Workforce work
            session
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              disabled={form.allocationSchedule.mode === "IMMEDIATE"}
              checked={form.allocationSchedule.postWebinarImmediate.enabled}
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
            Immediately assign payments received after the webinar
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
        <p className="mt-3 rounded-lg border border-indigo-100 bg-white/80 px-3 py-2 text-xs text-indigo-700">
          {form.allocationSchedule.mode === "SCHEDULED"
            ? `Registrations are grouped into the weekly ${form.webinarTitle}. Payments received by ${form.allocationSchedule.webinarCutoff.time} on ${form.allocationSchedule.webinarCutoff.weekday.toLowerCase()} belong to that webinar; later payments belong to the following week's webinar. Allocation runs are configured below.`
            : "Each valid payment is assigned as soon as Pabbly sends it."}
        </p>
      </section>

      {canAssignResponsibility ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-gray-900">Responsible leaders</h2>
          <p className="mt-1 text-xs text-gray-500">
            Admin can assign multiple people. These people can maintain
            distribution rules and reports.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {roster.map((member) => (
              <label
                key={member.employeeId}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.responsibleEmployeeIds.includes(
                    member.employeeId,
                  )}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      responsibleEmployeeIds: event.target.checked
                        ? [...current.responsibleEmployeeIds, member.employeeId]
                        : current.responsibleEmployeeIds.filter(
                            (id) => id !== member.employeeId,
                          ),
                    }))
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-gray-800">
                    {member.name}
                  </span>
                  <span className="block truncate text-[11px] text-gray-400">
                    {member.departmentName || "No department"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="font-bold text-gray-900">
                Call distribution team
              </h2>
              <p className="text-xs text-gray-500">
                Select any 2, 4, or the full team. Empty weekday selection means
                every day.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                roster.forEach((member) =>
                  toggleMember(member.employeeId, true),
                )
              }
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Select whole team
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
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="border-b border-gray-100 bg-gray-50/60 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
            Excluded departments
          </p>
          <div className="flex flex-wrap gap-2">
            {departments.map((department) => (
              <label
                key={department._id}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={form.excludedDepartmentIds.includes(department._id)}
                  onChange={(event) =>
                    setForm((current) => {
                      const departmentEmployeeIds = new Set(
                        roster
                          .filter(
                            (member) => member.departmentId === department._id,
                          )
                          .map((member) => member.employeeId),
                      );
                      return {
                        ...current,
                        excludedDepartmentIds: event.target.checked
                          ? [...current.excludedDepartmentIds, department._id]
                          : current.excludedDepartmentIds.filter(
                              (id) => id !== department._id,
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Use</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Eligible days</th>
                <th className="px-4 py-3">Share weight</th>
                <th className="px-4 py-3">Daily cap</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((member) => {
                const rule = rulesByEmployee.get(member.employeeId);
                const enabled = Boolean(rule?.enabled);
                const excluded = Boolean(
                  member.departmentId &&
                  form.excludedDepartmentIds.includes(member.departmentId),
                );
                return (
                  <tr
                    key={member.employeeId}
                    className="border-b border-gray-100"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={excluded}
                        onChange={(event) =>
                          toggleMember(member.employeeId, event.target.checked)
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">
                        {member.name}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {member.employeeId} ·{" "}
                        {member.departmentName || "Unassigned"}
                        {excluded ? " · department excluded" : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {WEEKDAYS.map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            disabled={!enabled}
                            onClick={() =>
                              toggleWeekday(member.employeeId, value)
                            }
                            className={`rounded px-1.5 py-1 text-[10px] font-semibold ${rule?.eligibleWeekdays.includes(value) ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"} disabled:opacity-40`}
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
                          !enabled || form.distributionMode !== "WEIGHTED"
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
                        disabled={!enabled}
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

        <div className="border-t border-indigo-100 bg-indigo-50/40 p-5">
          <h3 className="text-sm font-bold text-indigo-950">
            Fixed post-webinar team
          </h3>
          <p className="mt-1 text-xs text-indigo-700">
            Payments received after the Saturday webinar time are assigned
            immediately only to these selected people when their Workforce Agent
            is present. Changing this list never changes calls already assigned.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {roster.map((member) => {
              const rule = rulesByEmployee.get(member.employeeId);
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
                            ...current.allocationSchedule.postWebinarImmediate,
                            memberEmployeeIds: event.target.checked
                              ? [
                                  ...current.allocationSchedule
                                    .postWebinarImmediate.memberEmployeeIds,
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
              Select at least one enabled member, otherwise post-webinar
              payments will remain accumulated for manual distribution.
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <div>
          <h2 className="font-bold text-gray-900">
            Not-connected redistribution
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
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
              Redistribute automatically
            </label>
            <label>
              after
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
                className="mx-2 w-16 rounded border border-gray-200 px-2 py-1"
              />
              failed attempt(s)
            </label>
          </div>
        </div>
        <div>
          <h2 className="font-bold text-gray-900">Pending-call reminder</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
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
              Remind agents
            </label>
            <input
              type="time"
              value={form.reminder.time}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reminder: { ...current.reminder, time: event.target.value },
                }))
              }
              className="rounded border border-gray-200 px-2 py-1"
            />
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
              className="rounded border border-gray-200 px-2 py-1"
            >
              <option value="DAILY">Every day</option>
              <option value="ONCE">Once per configuration</option>
            </select>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : campaign ? "Save pattern" : "Create campaign"}
        </button>
      </div>
    </form>
  );
}
