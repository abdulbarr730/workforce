"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Download,
  PhoneCall,
  RefreshCw,
  Upload,
  UserRoundCheck,
} from "lucide-react";
import type {
  WelcomeCallCampaign,
  WelcomeCallLead,
  WelcomeCallReport,
} from "@workforce/shared-types";
import { api } from "@/lib/api";
import type { WelcomeCallRosterMember } from "./CampaignConfigurationForm";

const localDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const monthStart = () => `${localDate().slice(0, 7)}-01`;

const statusTone: Record<string, string> = {
  UNASSIGNED: "bg-gray-100 text-gray-700",
  PENDING: "bg-blue-50 text-blue-700",
  CONNECTED: "bg-emerald-50 text-emerald-700",
  NOT_CONNECTED: "bg-rose-50 text-rose-700",
  CALLBACK: "bg-amber-50 text-amber-700",
  WRONG_NUMBER: "bg-slate-100 text-slate-600",
  DO_NOT_CALL: "bg-purple-50 text-purple-700",
};

const DROPDOWN_COLORS = [
  "#dcfce7",
  "#fee2e2",
  "#fef3c7",
  "#dbeafe",
  "#ede9fe",
  "#fce7f3",
];

export function CampaignOperations({
  campaign,
  roster,
}: {
  campaign: WelcomeCallCampaign;
  roster: WelcomeCallRosterMember[];
}) {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(localDate);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [registeredDate, setRegisteredDate] = useState("");
  const [assignedDate, setAssignedDate] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [manualLead, setManualLead] = useState({
    registrantName: "",
    phone: "",
    email: "",
    externalRegistrationId: "",
  });
  const [message, setMessage] = useState("");
  const [copiedCell, setCopiedCell] = useState("");
  const [manualEmployeeIds, setManualEmployeeIds] = useState<string[]>([]);
  const [manualWebinarDate, setManualWebinarDate] = useState("");
  const [unavailableMembers, setUnavailableMembers] = useState<
    Array<{
      employeeId: string;
      employeeName: string;
      reason: "NOT_PRESENT" | "ON_LEAVE" | "HOLIDAY";
    }>
  >([]);

  const copyCell = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedCell(key);
    window.setTimeout(() => setCopiedCell(""), 1_200);
  };

  useEffect(() => {
    setManualEmployeeIds(campaign.nextAllocationEmployeeIds || []);
    setUnavailableMembers(campaign.scheduleState?.lastUnavailableMembers || []);
  }, [
    campaign._id,
    campaign.nextAllocationEmployeeIds,
    campaign.scheduleState?.lastAllocationAt,
  ]);

  const reportQuery = useQuery({
    queryKey: ["welcome-call-report", campaign._id, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      return api
        .get(`/api/welcome-calls/campaigns/${campaign._id}/report?${params}`)
        .then((response) => response.data.data as WelcomeCallReport);
    },
    staleTime: 20_000,
  });

  const leadsQuery = useQuery({
    queryKey: [
      "welcome-call-leads",
      campaign._id,
      status,
      deferredSearch,
      registeredDate,
      assignedDate,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (status) params.set("status", status);
      if (deferredSearch) params.set("search", deferredSearch);
      if (registeredDate) params.set("registeredDate", registeredDate);
      if (assignedDate) params.set("assignedDate", assignedDate);
      return api
        .get(`/api/welcome-calls/campaigns/${campaign._id}/leads?${params}`)
        .then(
          (response) =>
            response.data.data as { leads: WelcomeCallLead[]; total: number },
        );
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["welcome-call-report"] }),
      queryClient.invalidateQueries({ queryKey: ["welcome-call-leads"] }),
      queryClient.invalidateQueries({ queryKey: ["welcome-call-context"] }),
    ]);
  };

  const distribute = useMutation({
    mutationFn: () =>
      api.post(`/api/welcome-calls/campaigns/${campaign._id}/distribute`, {
        employeeIds: manualEmployeeIds.length ? manualEmployeeIds : undefined,
        webinarDate: manualWebinarDate || undefined,
      }),
    onSuccess: async (response) => {
      const allocation = response.data.data;
      setUnavailableMembers(allocation.unavailableMembers || []);
      setMessage(
        manualEmployeeIds.length
          ? `${allocation.assigned} untouched calls assigned after rebalancing ${allocation.rebalanced || 0}; ${allocation.protectedCompleted || 0} already-worked calls were protected.`
          : `${allocation.assigned} assigned; ${allocation.unassigned} remain unassigned.`,
      );
      setManualEmployeeIds([]);
      await refresh();
    },
  });
  const saveNextAllocationTeam = useMutation({
    mutationFn: (employeeIds: string[]) =>
      api.patch(
        "/api/welcome-calls/campaigns/" +
          campaign._id +
          "/next-allocation-team",
        { employeeIds },
      ),
    onError: () => {
      setManualEmployeeIds(campaign.nextAllocationEmployeeIds || []);
      setMessage("The next allocation team could not be saved.");
    },
  });

  const toggleNextAllocationEmployee = (employeeId: string) => {
    setManualEmployeeIds((current) => {
      const next = current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId];
      saveNextAllocationTeam.mutate(next);
      return next;
    });
  };
  const updateOutcome = useMutation({
    mutationFn: async ({
      lead,
      value,
    }: {
      lead: WelcomeCallLead;
      value: string;
    }) => {
      if (value === "PENDING") {
        return api.patch(`/api/welcome-calls/leads/${lead._id}/outcome`, {
          clear: true,
        });
      }
      const notes = window.prompt(
        "Optional notes for this call",
        lead.callAttempts?.at(-1)?.notes || "",
      );
      if (notes === null) return;
      let nextCallAt: string | undefined;
      if (value === "CALLBACK") {
        const requested = window.prompt(
          "Call-again date and time (example: 2026-08-12 15:30)",
          "",
        );
        if (!requested) return;
        nextCallAt = new Date(requested.replace(" ", "T")).toISOString();
      }
      return api.patch(`/api/welcome-calls/leads/${lead._id}/outcome`, {
        outcome: value,
        notes,
        nextCallAt,
      });
    },
    onSuccess: refresh,
  });

  const importLead = useMutation({
    mutationFn: () =>
      api.post(`/api/welcome-calls/campaigns/${campaign._id}/registrations`, {
        source: "admin-manual",
        registrations: [manualLead],
      }),
    onSuccess: async (response) => {
      const data = response.data.data;
      setMessage(
        data.allocation.accumulated
          ? `${data.created} registration added to the accumulated pool for the next scheduled batch.`
          : `${data.created} registration added and ${data.allocation.assigned} assigned.`,
      );
      setManualLead({
        registrantName: "",
        phone: "",
        email: "",
        externalRegistrationId: "",
      });
      await refresh();
    },
  });

  const assign = useMutation({
    mutationFn: ({
      leadId,
      employeeId,
    }: {
      leadId: string;
      employeeId: string;
    }) =>
      api.patch(`/api/welcome-calls/leads/${leadId}/assign`, { employeeId }),
    onSuccess: refresh,
  });

  const updateColumns = useMutation({
    mutationFn: (columns: NonNullable<WelcomeCallCampaign["customColumns"]>) =>
      api.patch(`/api/welcome-calls/campaigns/${campaign._id}/columns`, {
        columns,
      }),
    onSuccess: refresh,
  });

  const syncSheet = useMutation({
    mutationFn: () =>
      api.post(`/api/welcome-calls/campaigns/${campaign._id}/sync-sheet`),
    onSuccess: (response) =>
      setMessage(
        `${response.data.data.queued} registrations queued for the weekly Google Sheet. The complete master record stays in Admin and exports.`,
      ),
  });

  const addColumn = () => {
    const label = window.prompt("Column name (example: Will attend)", "");
    if (!label?.trim()) return;
    const optionsText = window.prompt(
      "Dropdown choices separated by commas. Leave blank for free text.",
      label.toLowerCase().includes("attend") ? "Yes,No,Maybe" : "",
    );
    if (optionsText === null) return;
    const options = optionsText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    updateColumns.mutate([
      ...(campaign.customColumns || []),
      {
        key: label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        label: label.trim(),
        options,
        optionColors: Object.fromEntries(
          options.map((option, index) => [
            option,
            DROPDOWN_COLORS[index % DROPDOWN_COLORS.length],
          ]),
        ),
      },
    ]);
  };

  const updateCustomField = useMutation({
    mutationFn: ({
      leadId,
      key,
      value,
    }: {
      leadId: string;
      key: string;
      value: string;
    }) =>
      api.patch(`/api/welcome-calls/leads/${leadId}/custom-fields`, {
        values: { [key]: value },
      }),
    onSuccess: refresh,
  });

  const exportExcel = async () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const response = await api.get(
      `/api/welcome-calls/campaigns/${campaign._id}/export?${params}`,
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${campaign.key}-welcome-calls.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const report = reportQuery.data;
  const leads = leadsQuery.data?.leads || [];
  const pabblyUrl = `${String(api.defaults.baseURL || "").replace(/\/$/, "")}/api/crm/welcome-calls/registrations/${campaign.key}`;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-bold text-indigo-950">Connect Pabbly first</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-indigo-700">
              In Pabbly, add an API action with method POST, JSON body, and an
              <strong> X-API-KEY</strong> header containing the backend
              CRM_API_KEY. Map Name, Phone/Mobile, Email, Order or Payment ID,
              Amount, and Created Date; common Pabbly field names are recognized
              automatically. Registrations follow the campaign&apos;s
              accumulation schedule instead of being assigned immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(pabblyUrl);
              setMessage("Pabbly webhook URL copied.");
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
          >
            <Copy className="h-4 w-4" /> Copy webhook URL
          </button>
        </div>
        <code className="mt-3 block overflow-x-auto rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs text-indigo-900">
          {pabblyUrl}
        </code>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Performance report
            </h2>
            <p className="text-xs text-gray-500">
              Connected percentage is unique connected registrations divided by
              registrations in this range.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-semibold text-gray-500">
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1 block rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-[11px] font-semibold text-gray-500">
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
              onClick={() => void exportExcel()}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <Download className="h-4 w-4" /> Export Excel
            </button>
          </div>
        </div>

        {reportQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Loading report…
          </p>
        ) : report ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-9">
              {[
                ["Registrations", report.totals.registrations],
                ["Accumulated", report.totals.unassigned],
                ["Assigned", report.totals.assigned],
                ["Pending", report.totals.pending],
                ["Connected", report.totals.connected],
                ["Not connected", report.totals.notConnected],
                ["Call again", report.totals.callback],
                ["Attempts", report.totals.attempts],
                ["Connected %", `${report.totals.connectionRate}%`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                >
                  <p className="text-xl font-bold text-gray-900">{value}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {label}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Assigned now</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Connected</th>
                    <th className="px-4 py-3">Not connected</th>
                    <th className="px-4 py-3">Call again</th>
                    <th className="px-4 py-3">Connected %</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byAgent.map((agent) => (
                    <tr
                      key={agent.employeeId}
                      className="border-t border-gray-100 text-sm"
                    >
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {agent.employeeName}
                        <span className="ml-2 text-[10px] font-normal text-gray-400">
                          {agent.employeeId}
                        </span>
                      </td>
                      <td className="px-4 py-3">{agent.currentlyAssigned}</td>
                      <td className="px-4 py-3">{agent.attempts}</td>
                      <td className="px-4 py-3 text-emerald-700">
                        {agent.connected}
                      </td>
                      <td className="px-4 py-3 text-rose-700">
                        {agent.notConnected}
                      </td>
                      <td className="px-4 py-3 text-amber-700">
                        {agent.callback}
                      </td>
                      <td className="px-4 py-3 font-bold text-indigo-700">
                        {agent.connectionRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-rose-600">
            Report unavailable.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Registrations and assignment
            </h2>
            <p className="text-xs text-gray-500">
              The webhook accumulates registrations automatically. Scheduled
              batches assign them; manual distribution remains available for
              exceptions.
            </p>
          </div>
          <div className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 lg:order-3">
            <p className="text-xs font-bold text-gray-700">
              Optional manual override team
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {roster
                .filter((member) =>
                  campaign.memberRules.some(
                    (rule) =>
                      rule.employeeId === member.employeeId && rule.enabled,
                  ),
                )
                .map((member) => {
                  const selected = manualEmployeeIds.includes(
                    member.employeeId,
                  );
                  return (
                    <button
                      key={member.employeeId}
                      type="button"
                      onClick={() =>
                        toggleNextAllocationEmployee(member.employeeId)
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
              Select nobody to allocate across configured employees who are
              present and not on leave. Selecting names adds them to the current
              allocation team and rebalances only untouched calls. Completed or
              attempted calls never move.
            </p>
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-bold text-emerald-900">
                Selected for the next allocation
              </p>
              {manualEmployeeIds.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {manualEmployeeIds.map((employeeId) => {
                    const member = roster.find(
                      (candidate) => candidate.employeeId === employeeId,
                    );
                    return (
                      <button
                        key={employeeId}
                        type="button"
                        title="Click to remove from the next allocation"
                        onClick={() => toggleNextAllocationEmployee(employeeId)}
                        className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-bold text-emerald-800 hover:border-rose-300 hover:text-rose-700"
                      >
                        {member?.name || employeeId} ×
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-emerald-700">
                  Nobody manually selected. The configured eligible team will be
                  used.
                </p>
              )}
              <p className="mt-2 text-[10px] text-emerald-700">
                Saved until the next scheduled 11:00 run or manual allocation
                consumes it.
              </p>
            </div>
            <label className="mt-3 block max-w-xs text-xs font-semibold text-gray-600">
              Allocate only registrations for webinar
              <input
                type="date"
                value={manualWebinarDate}
                onChange={(event) => setManualWebinarDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[11px] font-normal text-gray-500">
                Leave blank to distribute every unassigned webinar registration.
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => distribute.mutate()}
              disabled={distribute.isPending}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" /> Allocate all pending now
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {message ? (
          <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {message}
          </p>
        ) : null}
        {unavailableMembers.length ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-bold">
              These employees were not assigned calls. Their fair share remains
              unassigned.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unavailableMembers.map((member) => (
                <button
                  key={member.employeeId}
                  type="button"
                  onClick={() =>
                    toggleNextAllocationEmployee(member.employeeId)
                  }
                  className="rounded-full border border-amber-300 bg-white px-3 py-1 font-semibold hover:bg-amber-100"
                  title="Click to add or remove this employee"
                >
                  {member.employeeName} ·{" "}
                  {member.reason === "ON_LEAVE"
                    ? "on leave"
                    : member.reason === "HOLIDAY"
                      ? "holiday"
                      : "not present"}
                  {manualEmployeeIds.includes(member.employeeId)
                    ? " · selected"
                    : " · click to select"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px]">
              When someone arrives, click their name above and then click
              Allocate all pending now.
            </p>
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            importLead.mutate();
          }}
          className="mt-4 grid gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 md:grid-cols-[1fr_170px_1fr_1fr_auto]"
        >
          <input
            required
            placeholder="Registrant name"
            value={manualLead.registrantName}
            onChange={(event) =>
              setManualLead((current) => ({
                ...current,
                registrantName: event.target.value,
              }))
            }
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Phone"
            value={manualLead.phone}
            onChange={(event) =>
              setManualLead((current) => ({
                ...current,
                phone: event.target.value,
              }))
            }
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={manualLead.email}
            onChange={(event) =>
              setManualLead((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            placeholder="Registration ID (optional)"
            value={manualLead.externalRegistrationId}
            onChange={(event) =>
              setManualLead((current) => ({
                ...current,
                externalRegistrationId: event.target.value,
              }))
            }
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={importLead.isPending}
            className="flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> Add
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search person, agent, phone, source, webinar..."
            className="min-w-64 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs text-gray-500">
            Registered
            <input
              type="date"
              value={registeredDate}
              onChange={(event) => setRegisteredDate(event.target.value)}
              className="py-2 text-gray-700 outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs text-gray-500">
            Assigned
            <input
              type="date"
              value={assignedDate}
              onChange={(event) => setAssignedDate(event.target.value)}
              className="py-2 text-gray-700 outline-none"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {Object.keys(statusTone).map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addColumn}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700"
          >
            + Add column
          </button>
          <button
            type="button"
            onClick={() => syncSheet.mutate()}
            disabled={syncSheet.isPending}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50"
          >
            Sync Google Sheet
          </button>
        </div>

        {campaign.customColumns?.length ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            {campaign.customColumns.map((column) => (
              <span
                key={column.key}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <span className="font-semibold text-gray-700">
                  {column.label}
                </span>
                <button
                  type="button"
                  className="ml-2 font-bold text-rose-500"
                  aria-label={`Remove ${column.label}`}
                  onClick={() =>
                    updateColumns.mutate(
                      (campaign.customColumns || []).filter(
                        (candidate) => candidate.key !== column.key,
                      ),
                    )
                  }
                >
                  ×
                </button>
                {column.options.length ? (
                  <span className="mt-2 flex flex-wrap gap-2">
                    {column.options.map((option, index) => (
                      <label
                        key={option}
                        className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px]"
                      >
                        <input
                          type="color"
                          value={
                            column.optionColors?.[option] ||
                            DROPDOWN_COLORS[index % DROPDOWN_COLORS.length]
                          }
                          onChange={(event) =>
                            updateColumns.mutate(
                              (campaign.customColumns || []).map((candidate) =>
                                candidate.key === column.key
                                  ? {
                                      ...candidate,
                                      optionColors: {
                                        ...(candidate.optionColors || {}),
                                        [option]: event.target.value,
                                      },
                                    }
                                  : candidate,
                              ),
                            )
                          }
                          className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                          aria-label={`Choose colour for ${option}`}
                        />
                        {option}
                      </label>
                    ))}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[1050px]">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Assignment trail</th>
                <th className="px-4 py-3">Registrant</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Assigned on</th>
                <th className="px-4 py-3">Webinar</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Redistributed</th>
                <th className="px-4 py-3">Assigned agent</th>
                {(campaign.customColumns || []).map((column) => (
                  <th key={column.key} className="px-4 py-3">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id} className="border-t border-gray-100 text-sm">
                  <td
                    className="max-w-64 cursor-copy px-4 py-3 text-xs text-gray-500 hover:bg-indigo-50"
                    title="Click to copy assignment trail"
                    onClick={() =>
                      void copyCell(
                        `trail-${lead._id}`,
                        lead.assignmentHistory?.length
                          ? lead.assignmentHistory
                              .map((item) => item.employeeName)
                              .join(" → ")
                          : "Not assigned yet",
                      )
                    }
                  >
                    {lead.assignmentHistory?.length
                      ? lead.assignmentHistory
                          .map((item) => item.employeeName)
                          .join(" → ")
                      : "Not assigned yet"}
                  </td>
                  <td
                    className="cursor-copy px-4 py-3 hover:bg-indigo-50"
                    title="Click to copy name and email"
                    onClick={() =>
                      void copyCell(
                        `registrant-${lead._id}`,
                        [lead.registrantName, lead.email]
                          .filter(Boolean)
                          .join("\t"),
                      )
                    }
                  >
                    <p className="font-semibold text-gray-900">
                      {copiedCell === `registrant-${lead._id}`
                        ? "Copied"
                        : lead.registrantName}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {lead.email || lead.externalRegistrationId}
                    </p>
                  </td>
                  <td
                    className="cursor-copy px-4 py-3 font-medium text-gray-700 hover:bg-indigo-50"
                    title="Click to copy phone number"
                    onClick={() =>
                      void copyCell(`phone-${lead._id}`, lead.phone)
                    }
                  >
                    {lead.phone}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(lead.registeredAt).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {lead.assignedAt
                      ? new Date(lead.assignedAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Not assigned"}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-indigo-700">
                    {lead.webinarDate || "Legacy / ungrouped"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={
                        ["CONNECTED", "NOT_CONNECTED", "CALLBACK"].includes(
                          lead.status,
                        )
                          ? lead.status
                          : "PENDING"
                      }
                      onChange={(event) =>
                        updateOutcome.mutate({
                          lead,
                          value: event.target.value,
                        })
                      }
                      disabled={updateOutcome.isPending}
                      className={`rounded-lg border-0 px-2 py-1 text-[10px] font-bold ${statusTone[lead.status]}`}
                    >
                      <option value="PENDING">Blank / pending</option>
                      <option value="CONNECTED">Connected</option>
                      <option value="NOT_CONNECTED">Not connected</option>
                      <option value="CALLBACK">Call again</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">{lead.attemptCount}</td>
                  <td className="px-4 py-3">{lead.redistributionCount}</td>
                  <td className="px-4 py-3">
                    <label className="relative block">
                      <UserRoundCheck className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-gray-400" />
                      <select
                        value={lead.assignedToEmployeeId || ""}
                        onChange={(event) =>
                          assign.mutate({
                            leadId: lead._id,
                            employeeId: event.target.value,
                          })
                        }
                        className="w-52 rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-xs"
                      >
                        <option value="">Unassigned</option>
                        {roster.map((member) => (
                          <option
                            key={member.employeeId}
                            value={member.employeeId}
                          >
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </td>
                  {(campaign.customColumns || []).map((column) => {
                    const value = String(
                      (
                        lead.metadata?.customFields as
                          | Record<string, unknown>
                          | undefined
                      )?.[column.key] || "",
                    );
                    return (
                      <td key={column.key} className="px-4 py-3">
                        {column.options.length ? (
                          <select
                            defaultValue={value}
                            style={{
                              backgroundColor:
                                column.optionColors?.[value] || "#ffffff",
                            }}
                            onChange={(event) =>
                              updateCustomField.mutate({
                                leadId: lead._id,
                                key: column.key,
                                value: event.target.value,
                              })
                            }
                            className="w-full min-w-36 cursor-pointer rounded-lg border border-gray-200 px-2 py-2 text-xs font-bold"
                          >
                            <option value="">Blank</option>
                            {column.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            defaultValue={value}
                            onBlur={(event) => {
                              if (event.target.value !== value) {
                                updateCustomField.mutate({
                                  leadId: lead._id,
                                  key: column.key,
                                  value: event.target.value,
                                });
                              }
                            }}
                            className="w-40 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!leadsQuery.isLoading && leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-gray-400"
                  >
                    <PhoneCall className="mx-auto mb-2 h-6 w-6" /> No
                    registrations match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {leadsQuery.data?.total ? (
          <p className="mt-2 text-right text-[11px] text-gray-400">
            Showing {leads.length} of {leadsQuery.data.total} registrations
          </p>
        ) : null}
      </section>
    </div>
  );
}
