"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  ChevronRight,
  PhoneCall,
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
import {
  LeaderCampaignControls,
  type WelcomeCallDepartment,
  type WelcomeCallRosterMember,
} from "./LeaderCampaignControls";
import { LeaderRegistrations } from "./LeaderRegistrations";
import { WelcomeCallQueue } from "./WelcomeCallQueue";

type WelcomeCallContext = {
  campaigns: WelcomeCallCampaign[];
  campaignStats: Record<string, WelcomeCallCampaignStats>;
  manageableCampaignIds: string[];
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

export default function EmployeeWelcomeCallsPage() {
  const [view, setView] = useState<"QUEUE" | "CAMPAIGNS">("QUEUE");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<
    "SUMMARY" | "REGISTRATIONS" | "SETTINGS"
  >("SUMMARY");
  const [search, setSearch] = useState("");
  const contextQuery = useQuery({
    queryKey: ["welcome-call-context"],
    queryFn: () =>
      api
        .get("/api/welcome-calls/context")
        .then((response) => response.data.data as WelcomeCallContext),
    staleTime: 30_000,
  });
  const manageableCampaigns =
    contextQuery.data?.campaigns.filter((campaign) =>
      contextQuery.data?.manageableCampaignIds.includes(campaign._id),
    ) || [];
  const selected = manageableCampaigns.find(
    (campaign) => campaign._id === selectedId,
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? manageableCampaigns.filter((campaign) =>
          `${campaign.name} ${campaign.webinarTitle}`
            .toLowerCase()
            .includes(term),
        )
      : manageableCampaigns;
  }, [manageableCampaigns, search]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setSelectedId(null);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", close);
    };
  }, [selected]);

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <PhoneCall className="h-6 w-6 text-teal-600" /> Welcome calls
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Complete your assigned calls or manage campaigns for which you are
          responsible.
        </p>
      </header>
      {contextQuery.isError && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          Welcome-call information could not be loaded.
        </p>
      )}
      {contextQuery.data?.canManageAny && (
        <div className="inline-flex gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setView("QUEUE")}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${view === "QUEUE" ? "bg-gray-900 text-white" : "text-gray-500"}`}
          >
            My call queue
          </button>
          <button
            type="button"
            onClick={() => setView("CAMPAIGNS")}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${view === "CAMPAIGNS" ? "bg-gray-900 text-white" : "text-gray-500"}`}
          >
            Campaign management
          </button>
        </div>
      )}
      {view === "CAMPAIGNS" && contextQuery.data?.canManageAny ? (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-gray-900">Campaigns you manage</h2>
              <p className="text-xs text-gray-500">
                Click a campaign for registrations, remaining work, and member
                analysis.
              </p>
            </div>
            <label className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search campaigns"
                className="rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm"
              />
            </label>
          </div>
          <div className="divide-y divide-gray-100">
            {filtered.map((campaign) => {
              const stats =
                contextQuery.data!.campaignStats?.[campaign._id] || emptyStats;
              return (
                <button
                  key={campaign._id}
                  type="button"
                  onClick={() => {
                    setSelectedId(campaign._id);
                    setDrawerTab("SUMMARY");
                  }}
                  className="grid w-full gap-3 p-4 text-left hover:bg-teal-50/40 md:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(90px,.5fr))_32px] md:items-center"
                >
                  <div>
                    <p className="font-bold text-gray-900">{campaign.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {campaign.webinarTitle}
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
                        className={`text-lg font-black ${label === "Left" && Number(value) ? "text-amber-600" : "text-gray-800"}`}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </button>
              );
            })}
            {!filtered.length && (
              <p className="p-10 text-center text-sm text-gray-400">
                No campaigns assigned to you.
              </p>
            )}
          </div>
        </section>
      ) : (
        <WelcomeCallQueue />
      )}

      {selected && contextQuery.data && (
        <div
          className="fixed inset-0 z-[80] bg-gray-950/35 backdrop-blur-[2px]"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSelectedId(null)
          }
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="leader-campaign-title"
            className="absolute inset-0 flex w-full flex-col bg-gray-50 shadow-2xl"
          >
            <div className="flex justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-600">
                  Team leader workspace
                </p>
                <h2
                  id="leader-campaign-title"
                  className="mt-1 text-xl font-black text-gray-900"
                >
                  {selected.name}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  You can see every registration and the performance of each
                  allocated member.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close campaign"
                className="h-fit rounded-xl border border-gray-200 p-2 text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-5 py-2">
              {[
                ["SUMMARY", "Team analysis", BarChart3],
                ["REGISTRATIONS", "All registrations", Users],
                ["SETTINGS", "Allocation settings", Settings2],
              ].map(([value, label, Icon]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setDrawerTab(value as typeof drawerTab)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${drawerTab === value ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  <Icon className="h-4 w-4" />
                  {String(label)}
                </button>
              ))}
            </nav>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {drawerTab === "SUMMARY" && (
                <>
                  <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {Object.entries(
                      contextQuery.data.campaignStats?.[selected._id] ||
                        emptyStats,
                    ).map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-gray-200 bg-white p-4"
                      >
                        <div className="flex justify-between">
                          <p className="text-[10px] font-bold uppercase text-gray-400">
                            {label}
                          </p>
                          <Activity className="h-4 w-4 text-teal-500" />
                        </div>
                        <p className="mt-2 text-2xl font-black">{value}</p>
                      </div>
                    ))}
                  </section>
                  <LeaderCampaignControls
                    campaign={selected}
                    roster={contextQuery.data.roster}
                    departments={contextQuery.data.departments}
                    mode="REPORT"
                  />
                </>
              )}
              {drawerTab === "REGISTRATIONS" && (
                <LeaderRegistrations
                  campaign={selected}
                  roster={contextQuery.data.roster}
                />
              )}
              {drawerTab === "SETTINGS" && (
                <>
                  <div className="mb-4 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-800">
                    <b>What these settings do:</b> schedule controls when
                    accumulated calls are assigned; eligibility controls who can
                    receive them; presence and leave protect absent members;
                    retry rules recycle unsuccessful calls; reminders notify
                    members about work still pending.
                  </div>
                  <LeaderCampaignControls
                    campaign={selected}
                    roster={contextQuery.data.roster}
                    departments={contextQuery.data.departments}
                    mode="SETTINGS"
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
