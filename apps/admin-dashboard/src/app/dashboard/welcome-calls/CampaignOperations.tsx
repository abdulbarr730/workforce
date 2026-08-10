"use client";

import { useDeferredValue, useState } from "react";
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
  const deferredSearch = useDeferredValue(search);
  const [manualLead, setManualLead] = useState({
    registrantName: "",
    phone: "",
    email: "",
    externalRegistrationId: "",
  });
  const [message, setMessage] = useState("");
  const [manualEmployeeIds, setManualEmployeeIds] = useState<string[]>([]);
  const [manualWebinarDate, setManualWebinarDate] = useState("");

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
    queryKey: ["welcome-call-leads", campaign._id, status, deferredSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (status) params.set("status", status);
      if (deferredSearch) params.set("search", deferredSearch);
      return api
        .get(`/api/welcome-calls/campaigns/${campaign._id}/leads?${params}`)
        .then(
          (response) =>
            response.data.data as { leads: WelcomeCallLead[]; total: number },
        );
    },
    staleTime: 15_000,
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
      setMessage(
        `${allocation.assigned} assigned; ${allocation.unassigned} remain unassigned.`,
      );
      await refresh();
    },
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
              Manual allocation team (presence and leave are intentionally
              ignored)
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
              Select nobody to use all configured campaign members.
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
                Leave blank to distribute every unassigned webinar registration.
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => distribute.mutate()}
              disabled={distribute.isPending}
              className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" /> Distribute unassigned
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
            placeholder="Search name, phone, or email"
            className="min-w-64 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
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
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[1050px]">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Registrant</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Webinar</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Redistributed</th>
                <th className="px-4 py-3">Assigned agent</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id} className="border-t border-gray-100 text-sm">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">
                      {lead.registrantName}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {lead.email || lead.externalRegistrationId}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-700">
                    {lead.phone}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(lead.registeredAt).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-indigo-700">
                    {lead.webinarDate || "Legacy / ungrouped"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusTone[lead.status]}`}
                    >
                      {lead.status.replaceAll("_", " ")}
                    </span>
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
                </tr>
              ))}
              {!leadsQuery.isLoading && leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
