"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PhoneCall, Search } from "lucide-react";
import type {
  WelcomeCallCampaign,
  WelcomeCallLead,
} from "@workforce/shared-types";
import { api } from "@/lib/api";

const tones: Record<string, string> = {
  UNASSIGNED: "bg-gray-100 text-gray-700",
  PENDING: "bg-blue-50 text-blue-700",
  CONNECTED: "bg-emerald-50 text-emerald-700",
  NOT_CONNECTED: "bg-rose-50 text-rose-700",
  CALLBACK: "bg-amber-50 text-amber-700",
  WRONG_NUMBER: "bg-slate-100 text-slate-600",
  DO_NOT_CALL: "bg-purple-50 text-purple-700",
};

export function LeaderRegistrations({
  campaign,
}: {
  campaign: WelcomeCallCampaign;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  useEffect(() => setPage(1), [status, deferredSearch]);
  const query = useQuery({
    queryKey: [
      "welcome-call-leader-leads",
      campaign._id,
      status,
      deferredSearch,
      page,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100", page: String(page) });
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
  const leads = query.data?.leads || [];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="font-bold text-gray-900">All registrations</h3>
          <p className="mt-1 text-xs text-gray-500">
            Every person registered for this campaign, their assignment, status,
            and call history count.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, phone, or email"
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm sm:w-64"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {Object.keys(tones).map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full min-w-[900px] text-left">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Registrant</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Webinar</th>
              <th className="px-4 py-3">Assigned to</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Registered</th>
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
                    {lead.email || lead.externalRegistrationId || "No email"}
                  </p>
                </td>
                <td className="px-4 py-3">{lead.phone}</td>
                <td className="px-4 py-3 text-xs font-semibold text-indigo-700">
                  {lead.webinarDate || "Ungrouped"}
                </td>
                <td className="px-4 py-3 font-medium">
                  {lead.assignedToEmployeeName || (
                    <span className="text-amber-600">Not assigned</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${tones[lead.status] || tones.UNASSIGNED}`}
                  >
                    {lead.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">{lead.attemptCount}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(lead.registeredAt).toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
            {!query.isLoading && !leads.length && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-gray-400"
                >
                  <PhoneCall className="mx-auto mb-2 h-6 w-6" />
                  No registrations match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {query.data && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            Showing {(page - 1) * 100 + (leads.length ? 1 : 0)}–
            {(page - 1) * 100 + leads.length} of {query.data.total}{" "}
            registrations
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * 100 >= query.data.total}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
