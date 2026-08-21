"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  CalendarClock,
  ChevronRight,
  CircleHelp,
  PhoneCall,
  Plus,
  Search,
  Settings2,
  Users,
  X,
} from "lucide-react";
import type {
  WelcomeCallCampaign,
  WelcomeCallCampaignStats,
} from "@workforce/shared-types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import {
  CampaignConfigurationForm,
  CampaignConfigurationPayload,
  WelcomeCallDepartment,
  WelcomeCallRosterMember,
} from "./CampaignConfigurationForm";
import { CampaignOperations } from "./CampaignOperations";

type WelcomeCallContext = {
  campaigns: WelcomeCallCampaign[];
  campaignStats: Record<string, WelcomeCallCampaignStats>;
  manageableCampaignIds: string[];
  canCreateCampaign: boolean;
  canManageAny: boolean;
  roster: WelcomeCallRosterMember[];
  departments: WelcomeCallDepartment[];
};

const emptyStats: WelcomeCallCampaignStats = {
  registrations: 0,
  assigned: 0,
  unassigned: 0,
  connected: 0,
  pending: 0,
};

const settingGuide = [
  [
    "Webinar & payment window",
    "Groups each payment into the correct weekly webinar using the configured cutoff.",
  ],
  [
    "Automatic runs",
    "Controls exactly which working days and times accumulated registrations are distributed.",
  ],
  [
    "Eligible team",
    "Defines who may receive calls, their working days, allocation weight, and optional daily limit.",
  ],
  [
    "Presence & leave",
    "When enabled, automatic runs use only employees who are present and not on approved leave.",
  ],
  [
    "Post-webinar routing",
    "Routes new payments after the cutoff to the fixed post-webinar team without changing earlier assignments.",
  ],
  [
    "Retries & reminders",
    "Controls when unsuccessful calls return to the queue and when agents are reminded about pending work.",
  ],
] as const;

export default function WelcomeCallsAdminPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"OVERVIEW" | "OPERATIONS" | "SETTINGS">(
    "OVERVIEW",
  );
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  const contextQuery = useQuery({
    queryKey: ["welcome-call-context"],
    queryFn: () =>
      api
        .get("/api/welcome-calls/context")
        .then((response) => response.data.data as WelcomeCallContext),
    staleTime: 30_000,
  });
  const campaigns = contextQuery.data?.campaigns || [];
  const selectedCampaign = campaigns.find(
    (campaign) => campaign._id === selectedCampaignId,
  );
  const filteredCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? campaigns.filter((campaign) =>
          `${campaign.name} ${campaign.webinarTitle} ${campaign.key}`
            .toLowerCase()
            .includes(term),
        )
      : campaigns;
  }, [campaigns, search]);
  const totals = useMemo(
    () =>
      Object.values(contextQuery.data?.campaignStats || {}).reduce(
        (sum, row) => ({
          registrations: sum.registrations + row.registrations,
          assigned: sum.assigned + row.assigned,
          unassigned: sum.unassigned + row.unassigned,
          connected: sum.connected + row.connected,
          pending: sum.pending + row.pending,
        }),
        { ...emptyStats },
      ),
    [contextQuery.data?.campaignStats],
  );

  useEffect(() => {
    if (!selectedCampaignId && !creating) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" &&
      (setSelectedCampaignId(null), setCreating(false));
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", close);
    };
  }, [selectedCampaignId, creating]);

  const saveCampaign = useMutation({
    mutationFn: (payload: CampaignConfigurationPayload) =>
      creating
        ? api.post("/api/welcome-calls/campaigns", payload)
        : api.patch(
            `/api/welcome-calls/campaigns/${selectedCampaign?._id}`,
            payload,
          ),
    onSuccess: async (response) => {
      const campaign = response.data.data as WelcomeCallCampaign;
      setSelectedCampaignId(campaign._id);
      setCreating(false);
      setNotice("Campaign settings saved.");
      await queryClient.invalidateQueries({
        queryKey: ["welcome-call-context"],
      });
    },
  });

  const openCampaign = (id: string) => {
    setSelectedCampaignId(id);
    setCreating(false);
    setTab("OVERVIEW");
    setNotice("");
  };
  const closeDrawer = () => {
    setSelectedCampaignId(null);
    setCreating(false);
    setNotice("");
  };

  if (contextQuery.isLoading)
    return (
      <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-400">
        Loading welcome-call campaigns...
      </div>
    );
  if (contextQuery.isError || !contextQuery.data)
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        Welcome-call campaigns could not be loaded.
      </div>
    );

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <PhoneCall className="h-6 w-6 text-indigo-600" /> Welcome-call
            campaigns
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Choose a campaign to inspect registrations, team performance,
            allocation, and automation settings.
          </p>
        </div>
        {contextQuery.data.canCreateCampaign && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setSelectedCampaignId(null);
              setTab("SETTINGS");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" /> New campaign
          </button>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(
          [
            ["Campaigns", campaigns.length, PhoneCall],
            ["Registrations", totals.registrations, Users],
            ["Assigned", totals.assigned, Activity],
            ["Left to assign", totals.unassigned, CalendarClock],
            ["Connected", totals.connected, BarChart3],
          ] as const
        ).map(([label, value, Icon]) => (
          <div
            key={label}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                {label}
              </p>
              <Icon className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-gray-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-gray-900">All campaigns</h2>
            <p className="text-xs text-gray-500">
              Open one campaign at a time. Detailed data loads only when needed.
            </p>
          </div>
          <label className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search campaigns"
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm sm:w-72"
            />
          </label>
        </div>
        <div className="divide-y divide-gray-100">
          {filteredCampaigns.map((campaign) => {
            const stats =
              contextQuery.data.campaignStats?.[campaign._id] || emptyStats;
            return (
              <button
                key={campaign._id}
                type="button"
                onClick={() => openCampaign(campaign._id)}
                className="grid w-full gap-4 p-4 text-left transition hover:bg-indigo-50/40 md:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(90px,.5fr))_32px] md:items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${campaign.isActive ? "bg-emerald-500" : "bg-gray-300"}`}
                    />
                    <p className="font-bold text-gray-900">{campaign.name}</p>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {campaign.webinarTitle || "Weekly webinar"} ·{" "}
                    {campaign.currency} {campaign.registrationAmount}
                  </p>
                </div>
                {[
                  ["Registered", stats.registrations],
                  ["Assigned", stats.assigned],
                  ["Left", stats.unassigned],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-[10px] font-bold uppercase text-gray-400">
                      {label}
                    </p>
                    <p
                      className={`text-lg font-black ${label === "Left" && Number(value) > 0 ? "text-amber-600" : "text-gray-800"}`}
                    >
                      {value}
                    </p>
                  </div>
                ))}
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </button>
            );
          })}
          {!filteredCampaigns.length && (
            <p className="p-10 text-center text-sm text-gray-400">
              No matching campaigns.
            </p>
          )}
        </div>
      </section>

      {(selectedCampaign || creating) && (
        <div
          className="fixed inset-0 z-[80] bg-gray-950/35 backdrop-blur-[2px]"
          onMouseDown={(event) =>
            event.target === event.currentTarget && closeDrawer()
          }
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="campaign-drawer-title"
            className="absolute inset-0 flex w-full flex-col bg-gray-50 shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">
                  Campaign workspace
                </p>
                <h2
                  id="campaign-drawer-title"
                  className="mt-1 text-xl font-black text-gray-900"
                >
                  {creating ? "Create campaign" : selectedCampaign?.name}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {creating
                    ? "Build a reusable allocation pattern."
                    : `${(contextQuery.data.campaignStats?.[selectedCampaign!._id] || emptyStats).unassigned} registrations currently left to assign`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close campaign"
                className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {!creating && (
              <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-5 py-2">
                {[
                  ["OVERVIEW", "Overview", BarChart3],
                  ["OPERATIONS", "Registrations & team", Users],
                  ["SETTINGS", "Allocation settings", Settings2],
                ].map(([value, label, Icon]) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setTab(value as typeof tab)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${tab === value ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {String(label)}
                  </button>
                ))}
              </nav>
            )}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {notice && (
                <p className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {notice}
                </p>
              )}
              {saveCampaign.isError && (
                <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {(saveCampaign.error as any)?.response?.data?.message ||
                    "The campaign could not be saved."}
                </p>
              )}
              {!creating && tab === "OVERVIEW" && selectedCampaign && (
                <div className="space-y-5">
                  <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {Object.entries(
                      contextQuery.data.campaignStats?.[selectedCampaign._id] ||
                        emptyStats,
                    ).map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-gray-200 bg-white p-4"
                      >
                        <p className="text-[10px] font-bold uppercase text-gray-400">
                          {label}
                        </p>
                        <p className="mt-2 text-2xl font-black text-gray-900">
                          {value}
                        </p>
                      </div>
                    ))}
                  </section>
                  <section className="rounded-2xl border border-indigo-100 bg-white p-5">
                    <h3 className="flex items-center gap-2 font-bold text-gray-900">
                      <CircleHelp className="h-5 w-5 text-indigo-600" /> How the
                      allocation settings work
                    </h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {settingGuide.map(([title, text]) => (
                        <div
                          key={title}
                          className="rounded-xl bg-indigo-50/60 p-3"
                        >
                          <p className="text-sm font-bold text-gray-800">
                            {title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-gray-600">
                            {text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
              {!creating && tab === "OPERATIONS" && selectedCampaign && (
                <CampaignOperations
                  campaign={selectedCampaign}
                  roster={contextQuery.data.roster}
                />
              )}
              {(creating || tab === "SETTINGS") && (
                <>
                  <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
                    <b>Settings are reusable:</b> automatic runs affect future
                    unassigned registrations only. Existing assignments are
                    never silently moved.
                  </div>
                  <CampaignConfigurationForm
                    campaign={creating ? undefined : selectedCampaign}
                    roster={contextQuery.data.roster}
                    departments={contextQuery.data.departments}
                    canAssignResponsibility={
                      user?.role === "SUPER_ADMIN" || user?.role === "ADMIN"
                    }
                    saving={saveCampaign.isPending}
                    onSave={(payload) => saveCampaign.mutate(payload)}
                  />
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
