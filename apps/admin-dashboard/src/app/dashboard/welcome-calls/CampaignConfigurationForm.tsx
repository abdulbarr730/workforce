"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Save, Users } from "lucide-react";
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

const emptyPayload = (): CampaignConfigurationPayload => ({
  name: "₹195 Webinar Welcome Calls",
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
            Pattern duration
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
                setForm((current) => ({ ...current, memberRules: [] }))
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
                    setForm((current) => ({
                      ...current,
                      excludedDepartmentIds: event.target.checked
                        ? [...current.excludedDepartmentIds, department._id]
                        : current.excludedDepartmentIds.filter(
                            (id) => id !== department._id,
                          ),
                    }))
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
