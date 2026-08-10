"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PhoneCall, Settings2 } from "lucide-react";
import type { WelcomeCallCampaign } from "@workforce/shared-types";
import { api } from "@/lib/api";
import {
  LeaderCampaignControls,
  type WelcomeCallDepartment,
  type WelcomeCallRosterMember,
} from "./LeaderCampaignControls";
import { WelcomeCallQueue } from "./WelcomeCallQueue";

type WelcomeCallContext = {
  campaigns: WelcomeCallCampaign[];
  manageableCampaignIds: string[];
  canManageAny: boolean;
  roster: WelcomeCallRosterMember[];
  departments: WelcomeCallDepartment[];
};

export default function EmployeeWelcomeCallsPage() {
  const [tab, setTab] = useState<"QUEUE" | "MANAGE">("QUEUE");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
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
  const selectedCampaign =
    manageableCampaigns.find(
      (campaign) => campaign._id === selectedCampaignId,
    ) || manageableCampaigns[0];

  useEffect(() => {
    if (!selectedCampaignId && manageableCampaigns[0]) {
      setSelectedCampaignId(manageableCampaigns[0]._id);
    }
  }, [manageableCampaigns, selectedCampaignId]);

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <PhoneCall className="h-6 w-6 text-teal-600" /> Welcome calls
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Your assigned webinar registrations, follow-ups, and call outcomes.
        </p>
      </header>

      {contextQuery.isError ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          Welcome-call information could not be loaded.
        </p>
      ) : null}

      {contextQuery.data?.canManageAny ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab("QUEUE")}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "QUEUE" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              My call queue
            </button>
            <button
              type="button"
              onClick={() => setTab("MANAGE")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${tab === "MANAGE" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              <Settings2 className="h-4 w-4" /> Manage allocation
            </button>
          </div>
          {tab === "MANAGE" && manageableCampaigns.length > 1 ? (
            <select
              value={selectedCampaign?._id || ""}
              onChange={(event) => setSelectedCampaignId(event.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
            >
              {manageableCampaigns.map((campaign) => (
                <option key={campaign._id} value={campaign._id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {tab === "MANAGE" && selectedCampaign && contextQuery.data ? (
        <LeaderCampaignControls
          campaign={selectedCampaign}
          roster={contextQuery.data.roster}
          departments={contextQuery.data.departments}
        />
      ) : (
        <WelcomeCallQueue />
      )}
    </div>
  );
}
