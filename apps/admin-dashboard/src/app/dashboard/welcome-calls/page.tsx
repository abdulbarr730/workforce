"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, Plus, Settings2, BarChart3 } from "lucide-react";
import type { WelcomeCallCampaign } from "@workforce/shared-types";
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
  manageableCampaignIds: string[];
  canCreateCampaign: boolean;
  canManageAny: boolean;
  roster: WelcomeCallRosterMember[];
  departments: WelcomeCallDepartment[];
};

export default function WelcomeCallsAdminPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"CONFIG" | "REPORT">("CONFIG");
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
  const selectedCampaign =
    campaigns.find((campaign) => campaign._id === selectedCampaignId) ||
    campaigns[0];

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
      setNotice("Allocation pattern saved successfully.");
      await queryClient.invalidateQueries({
        queryKey: ["welcome-call-context"],
      });
    },
  });

  if (contextQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
        Loading welcome-call automation…
      </div>
    );
  }

  if (contextQuery.isError || !contextQuery.data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        Welcome-call automation could not be loaded.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <PhoneCall className="h-6 w-6 text-indigo-600" /> Welcome-call
            automation
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Automatically distribute webinar registrations, recycle
            not-connected calls, and measure every agent&apos;s connection rate.
          </p>
        </div>
        {contextQuery.data.canCreateCampaign ? (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setSelectedCampaignId(null);
              setTab("CONFIG");
              setNotice("");
            }}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" /> New campaign
          </button>
        ) : null}
      </header>

      <div className="grid gap-5 xl:grid-cols-[260px_1fr]">
        <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Campaigns
          </p>
          <div className="space-y-1">
            {campaigns.map((campaign) => {
              const active =
                !creating && selectedCampaign?._id === campaign._id;
              return (
                <button
                  key={campaign._id}
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setSelectedCampaignId(campaign._id);
                    setNotice("");
                  }}
                  className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${active ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-gray-50"}`}
                >
                  <span className="block truncate text-sm font-bold text-gray-900">
                    {campaign.name}
                  </span>
                  <span className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
                    <span>
                      {campaign.currency} {campaign.registrationAmount}
                    </span>
                    <span
                      className={
                        campaign.isActive ? "text-emerald-600" : "text-gray-400"
                      }
                    >
                      {campaign.isActive ? "Active" : "Paused"}
                    </span>
                  </span>
                </button>
              );
            })}
            {campaigns.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-gray-400">
                No campaigns yet. Create the ₹195 webinar campaign to begin.
              </p>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0">
          {creating || selectedCampaign ? (
            <>
              {!creating ? (
                <div className="mb-5 flex gap-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
                  {[
                    ["CONFIG", "Pattern & team", Settings2],
                    ["REPORT", "Calls & report", BarChart3],
                  ].map(([value, label, Icon]) => (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={() => setTab(value as "CONFIG" | "REPORT")}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === value ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      <Icon className="h-4 w-4" /> {String(label)}
                    </button>
                  ))}
                </div>
              ) : null}

              {notice ? (
                <p className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {notice}
                </p>
              ) : null}
              {saveCampaign.isError ? (
                <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {(saveCampaign.error as any)?.response?.data?.message ||
                    "The campaign could not be saved."}
                </p>
              ) : null}

              {creating || tab === "CONFIG" ? (
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
              ) : selectedCampaign ? (
                <CampaignOperations
                  campaign={selectedCampaign}
                  roster={contextQuery.data.roster}
                />
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-400">
              Create a campaign to configure automatic distribution.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
