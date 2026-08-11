"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Phone, PhoneCall, RefreshCw } from "lucide-react";
import type {
  WelcomeCallCampaign,
  WelcomeCallLead,
  WelcomeCallOutcome,
} from "@workforce/shared-types";
import { api } from "@/lib/api";

type QueueLead = WelcomeCallLead & {
  campaignName?: string;
  canAct?: boolean;
  canEdit?: boolean;
};

type QueueResponse = {
  leads: QueueLead[];
  counts: Record<string, number>;
  campaigns: Array<
    Pick<
      WelcomeCallCampaign,
      "_id" | "name" | "reminder" | "revision" | "outcomeOptions"
    > & {
      isEffective: boolean;
    }
  >;
};

const OUTCOMES: Array<{ value: WelcomeCallOutcome; label: string }> = [
  { value: "CONNECTED", label: "Connected" },
  { value: "NOT_CONNECTED", label: "Not connected" },
  { value: "CALLBACK", label: "Call again" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
  { value: "DO_NOT_CALL", label: "Do not call" },
];

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString([], {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Today";

export function WelcomeCallQueue({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<WelcomeCallOutcome>("CONNECTED");
  const [notes, setNotes] = useState("");
  const [nextCallAt, setNextCallAt] = useState("");
  const [notice, setNotice] = useState("");
  const [range, setRange] = useState<"week" | "month" | "all">("week");
  const [statusFilter, setStatusFilter] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueQuery = useQuery({
    queryKey: ["my-welcome-call-queue", range],
    queryFn: () =>
      api
        .get(`/api/welcome-calls/my-queue?includeClosed=true&range=${range}`)
        .then((response) => response.data.data as QueueResponse),
    staleTime: 30_000,
    refetchInterval: 15_000,
  });

  const outcomeMutation = useMutation({
    mutationFn: ({ leadId, clear }: { leadId: string; clear?: boolean }) => {
      return api.patch(
        `/api/welcome-calls/leads/${leadId}/outcome`,
        clear
          ? { clear: true }
          : {
              outcome,
              notes,
              nextCallAt: outcome === "CALLBACK" ? nextCallAt : undefined,
            },
      );
    },
    onSuccess: async (_response, variables) => {
      setNotice(
        variables.clear
          ? "Result cleared. The call is back in its original pending state."
          : outcome === "NOT_CONNECTED"
            ? "Outcome saved. This call was automatically recycled when the campaign rule required it."
            : "Call outcome saved.",
      );
      setActiveLeadId(null);
      setNotes("");
      setNextCallAt("");
      await queryClient.invalidateQueries({
        queryKey: ["my-welcome-call-queue"],
      });
    },
  });

  useEffect(() => {
    if (!activeLeadId || outcome === "CALLBACK") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      outcomeMutation.mutate({ leadId: activeLeadId });
    }, 2_000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activeLeadId, outcome]);

  const pauseAutoSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  };

  const saveOnBlur = () => {
    if (outcome === "CALLBACK" && !nextCallAt) return;
    if (activeLeadId && !outcomeMutation.isPending) {
      outcomeMutation.mutate({ leadId: activeLeadId });
    }
  };

  const leads = queueQuery.data?.leads || [];
  const campaignOptions = new Map(
    (queueQuery.data?.campaigns || []).map((campaign) => [
      campaign._id,
      campaign.outcomeOptions?.length
        ? campaign.outcomeOptions
        : (["CONNECTED", "NOT_CONNECTED", "CALLBACK"] as WelcomeCallOutcome[]),
    ]),
  );
  const visibleOutcomeChoices = OUTCOMES.filter((item) =>
    Array.from(campaignOptions.values()).some((options) =>
      options.includes(item.value),
    ),
  );
  const remainingCount = leads.filter(
    (lead) => lead.assignedToEmployeeId && lead.status === "PENDING",
  ).length;
  const dueLeads = useMemo(
    () =>
      [...leads].sort((left, right) => {
        const leftDate = left.nextCallAt || left.registeredAt;
        const rightDate = right.nextCallAt || right.registeredAt;
        return new Date(leftDate).getTime() - new Date(rightDate).getTime();
      }),
    [leads],
  );
  const visibleLeads = statusFilter
    ? dueLeads.filter((lead) => lead.status === statusFilter)
    : dueLeads;

  if (queueQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
        Loading your welcome calls...
      </div>
    );
  }

  if (queueQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Your welcome-call queue could not be loaded.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900">Call activity</p>
          <p className="text-xs text-gray-500">
            Completed calls remain available in your history.
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          {(
            [
              ["week", "7 days"],
              ["month", "Month"],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${range === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          {visibleOutcomeChoices.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Remaining", remainingCount],
          ["Call again", queueQuery.data?.counts.CALLBACK || 0],
          ["Connected", queueQuery.data?.counts.CONNECTED || 0],
        ].map(([label, count]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{count}</p>
          </div>
        ))}
      </div>

      {notice ? (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-gray-900">
              <PhoneCall className="h-4 w-4 text-teal-600" /> Calls assigned to
              me
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Save each result here. Completed and reassigned calls remain in
              your selected history range.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void queueQuery.refetch()}
            disabled={queueQuery.isFetching}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            aria-label="Refresh welcome calls"
          >
            <RefreshCw
              className={`h-4 w-4 ${queueQuery.isFetching ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {visibleLeads.length === 0 ? (
          <div className="px-5 py-14 text-center text-sm text-gray-400">
            <Phone className="mx-auto mb-2 h-7 w-7" />
            No welcome-call activity exists for this period.
          </div>
        ) : (
          <div className={compact ? "max-h-[560px] overflow-y-auto" : ""}>
            {visibleLeads.map((lead) => {
              const active = activeLeadId === lead._id;
              return (
                <article
                  key={lead._id}
                  className="border-b border-gray-100 p-4 last:border-b-0"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-gray-900">
                          {lead.registrantName}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {lead.status.replaceAll("_", " ")}
                        </span>
                        {lead.redistributionCount > 0 ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            Reassigned {lead.redistributionCount}x
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {lead.campaignName || "Welcome calls"} · Registered{" "}
                        {formatDateTime(lead.registeredAt)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-indigo-600">
                        Webinar: {lead.webinarDate || "Legacy / ungrouped"}
                      </p>
                      {lead.nextCallAt ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-indigo-600">
                          <CalendarClock className="h-3.5 w-3.5" /> Call again{" "}
                          {formatDateTime(lead.nextCallAt)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`tel:${lead.phone}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-700"
                      >
                        <Phone className="h-4 w-4" /> {lead.phone}
                      </a>
                      {lead.canEdit ? (
                        <>
                          <label
                            className="sr-only"
                            htmlFor={`result-${lead._id}`}
                          >
                            Select call result for {lead.registrantName}
                          </label>
                          <select
                            id={`result-${lead._id}`}
                            value={active ? outcome : ""}
                            onChange={(event) => {
                              const selected = event.target.value;
                              if (selected === "__CLEAR__") {
                                setNotice("Clearing result...");
                                outcomeMutation.mutate({
                                  leadId: lead._id,
                                  clear: true,
                                });
                                return;
                              }
                              if (!selected) return;
                              setActiveLeadId(lead._id);
                              setOutcome(selected as WelcomeCallOutcome);
                              setNotes("");
                              setNextCallAt("");
                              setNotice("");
                            }}
                            className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            aria-label={`Select call result for ${lead.registrantName}`}
                          >
                            <option value="" disabled>
                              Result
                            </option>
                            <option value="__CLEAR__">
                              Blank / reset to original
                            </option>
                            {OUTCOMES.filter((item) =>
                              (
                                campaignOptions.get(lead.campaignId) || [
                                  "CONNECTED",
                                  "NOT_CONNECTED",
                                  "CALLBACK",
                                ]
                              ).includes(item.value),
                            ).map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">
                          Recorded
                        </span>
                      )}
                    </div>
                  </div>

                  {active ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        outcomeMutation.mutate({ leadId: lead._id });
                      }}
                      className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-3 md:grid-cols-[180px_1fr_auto]"
                    >
                      <div className="self-center text-xs font-semibold text-gray-600">
                        Result:{" "}
                        <span className="text-gray-900">
                          {
                            OUTCOMES.find((item) => item.value === outcome)
                              ?.label
                          }
                        </span>
                      </div>
                      {outcome === "CALLBACK" ? (
                        <label className="text-xs font-semibold text-gray-600">
                          Call again at
                          <input
                            required
                            type="datetime-local"
                            value={nextCallAt}
                            onChange={(event) =>
                              setNextCallAt(event.target.value)
                            }
                            onBlur={saveOnBlur}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                      ) : (
                        <label className="text-xs font-semibold text-gray-600">
                          Notes
                          <input
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            onFocus={pauseAutoSave}
                            onBlur={saveOnBlur}
                            placeholder="Optional call notes"
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                      )}
                      <div className="self-end rounded-lg bg-white px-4 py-2 text-center text-xs font-semibold text-gray-500">
                        {outcomeMutation.isPending
                          ? "Saving..."
                          : "Auto-saves in 2 seconds"}
                      </div>
                      {outcome === "CALLBACK" ? (
                        <label className="text-xs font-semibold text-gray-600 md:col-span-3">
                          Notes
                          <input
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            onFocus={pauseAutoSave}
                            onBlur={saveOnBlur}
                            placeholder="Optional context for the follow-up"
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                      ) : null}
                      {outcomeMutation.isError ? (
                        <p className="text-xs text-red-600 md:col-span-3">
                          {(outcomeMutation.error as any)?.response?.data
                            ?.message || "The outcome could not be saved."}
                        </p>
                      ) : null}
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
