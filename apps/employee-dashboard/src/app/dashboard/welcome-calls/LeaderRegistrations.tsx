"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, Search } from "lucide-react";
import type {
  WelcomeCallCampaign,
  WelcomeCallLead,
} from "@workforce/shared-types";
import { api } from "@/lib/api";
import type { WelcomeCallRosterMember } from "./LeaderCampaignControls";

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
  roster,
}: {
  campaign: WelcomeCallCampaign;
  roster: WelcomeCallRosterMember[];
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sheetMissing, setSheetMissing] = useState(false);
  const [registeredDate, setRegisteredDate] = useState("");
  const [assignedDate, setAssignedDate] = useState("");
  const [manualLead, setManualLead] = useState({
    registrantName: "",
    phone: "",
    email: "",
  });
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  useEffect(() => setPage(1), [status, deferredSearch]);
  const query = useQuery({
    queryKey: [
      "welcome-call-leader-leads",
      campaign._id,
      status,
      sheetMissing,
      deferredSearch,
      registeredDate,
      assignedDate,
      page,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100", page: String(page) });
      if (status) params.set("status", status);
      if (sheetMissing) params.set("sheetMissing", "true");
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
  const assign = useMutation({
    mutationFn: ({
      leadId,
      employeeId,
    }: {
      leadId: string;
      employeeId: string;
    }) =>
      api.patch(`/api/welcome-calls/leads/${leadId}/assign`, { employeeId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["welcome-call-leader-leads"],
        }),
        queryClient.invalidateQueries({ queryKey: ["welcome-call-context"] }),
        queryClient.invalidateQueries({
          queryKey: ["welcome-call-team-report"],
        }),
      ]);
    },
  });
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["welcome-call-leader-leads"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["welcome-call-team-report"],
        }),
      ]);
    },
  });
  const leads = query.data?.leads || [];
  const addRegistration = useMutation({
    mutationFn: () =>
      api.post(
        "/api/welcome-calls/campaigns/" + campaign._id + "/registrations",
        { source: "leader-manual", registrations: [manualLead] },
      ),
    onSuccess: async () => {
      setManualLead({ registrantName: "", phone: "", email: "" });
      await queryClient.invalidateQueries({
        queryKey: ["welcome-call-leader-leads"],
      });
    },
  });
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
      api.patch("/api/welcome-calls/leads/" + leadId + "/custom-fields", {
        values: { [key]: value },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["welcome-call-leader-leads"],
      });
    },
  });

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="font-bold text-gray-900">All registrations</h3>
          <p className="mt-1 text-xs text-gray-500">
            Every outcome and assignment remains visible. Reassign a
            not-connected call directly here.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setSheetMissing((value) => !value)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold ${sheetMissing ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-600"}`}
          >
            Missing in sheet
          </button>
          <button
            type="button"
            onClick={() => setStatus("NOT_CONNECTED")}
            className={`rounded-xl border px-3 py-2 text-xs font-bold ${status === "NOT_CONNECTED" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-gray-200 text-gray-600"}`}
          >
            Not-connected pool
          </button>
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
      <form
        className="mt-4 grid gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 md:grid-cols-[1fr_180px_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          addRegistration.mutate();
        }}
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
        <button
          disabled={addRegistration.isPending}
          className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold text-white"
        >
          Add registration
        </button>
      </form>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <label className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500">
          Registered{" "}
          <input
            type="date"
            value={registeredDate}
            onChange={(event) => setRegisteredDate(event.target.value)}
          />
        </label>
        <label className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500">
          Assigned{" "}
          <input
            type="date"
            value={assignedDate}
            onChange={(event) => setAssignedDate(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full min-w-[1120px] text-left">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Registrant</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Webinar</th>
              <th className="px-4 py-3">Assignment trail</th>
              <th className="px-4 py-3">Current assignee</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3">Assigned on</th>
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
                <td className="max-w-64 px-4 py-3 text-xs text-gray-500">
                  {lead.assignmentHistory?.length
                    ? lead.assignmentHistory
                        .map((item) => item.employeeName)
                        .join(" → ")
                    : "Not assigned yet"}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={lead.assignedToEmployeeId || ""}
                    onChange={(event) =>
                      assign.mutate({
                        leadId: lead._id,
                        employeeId: event.target.value,
                      })
                    }
                    disabled={assign.isPending}
                    className="w-44 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                  >
                    <option value="">Unassigned</option>
                    {roster.map((member) => (
                      <option key={member.employeeId} value={member.employeeId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
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
                    className={`rounded-lg border-0 px-2 py-1 text-[10px] font-bold ${tones[lead.status] || tones.UNASSIGNED}`}
                  >
                    <option value="PENDING">Blank / pending</option>
                    <option value="CONNECTED">Connected</option>
                    <option value="NOT_CONNECTED">Not connected</option>
                    <option value="CALLBACK">Call again</option>
                  </select>
                  {lead.metadata?.sheetSyncMissing ? (
                    <p className="mt-1 text-[10px] font-bold text-orange-600">
                      Missing in Google Sheet
                    </p>
                  ) : null}
                  {lead.status === "NOT_CONNECTED" && lead.nextCallAt ? (
                    <p className="mt-1 text-[10px] text-rose-600">
                      Auto reassign{" "}
                      {new Date(lead.nextCallAt).toLocaleDateString("en-IN")}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3">{lead.attemptCount}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(lead.registeredAt).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {lead.assignedAt
                    ? new Date(lead.assignedAt).toLocaleString("en-IN")
                    : "Not assigned"}
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
                          className="w-full min-w-36 cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold"
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
            {!query.isLoading && !leads.length && (
              <tr>
                <td
                  colSpan={9 + (campaign.customColumns?.length || 0)}
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
            {(page - 1) * 100 + leads.length} of {query.data.total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * 100 >= query.data.total}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
