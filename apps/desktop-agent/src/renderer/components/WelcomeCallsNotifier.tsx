import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import type {
  WelcomeCallCampaign,
  WelcomeCallLead,
} from "@workforce/shared-types";

// Welcome calls are worked on the employee web dashboard. The agent only
// keeps the desktop alerts (new calls, callbacks due, campaign reminders,
// missing sheet rows) - the same logic the old in-agent panel ran, without
// any UI.

type QueueLead = WelcomeCallLead & {
  campaignName?: string;
  canAct?: boolean;
  canEdit?: boolean;
};
type QueueCampaign = Pick<
  WelcomeCallCampaign,
  "_id" | "name" | "reminder" | "revision" | "outcomeOptions" | "customColumns"
> & { isEffective: boolean };
type QueueData = {
  leads: QueueLead[];
  counts: Record<string, number>;
  campaigns: QueueCampaign[];
};

// Every welcome-call alert is labelled "Welcome Calls" and its button opens
// the queue on the employee dashboard.
const notify = (
  title: string,
  body: string,
  meta: { clientName?: string; clientPhone?: string } = {},
) => {
  const electronApi = (window as any).electronAPI;
  if (electronApi?.showNotification) {
    electronApi.showNotification({
      title,
      body,
      message: body,
      type: "welcome_call",
      action: "dashboard:/dashboard/welcome-calls",
      meta,
    });
    return;
  }
  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    new Notification(title, { body });
  }
};

const localDate = () => {
  const now = new Date();
  const adjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const reminderStorageKey = (campaign: QueueCampaign) =>
  campaign.reminder.frequency === "DAILY"
    ? `welcome-call-reminder:${campaign._id}:${localDate()}`
    : `welcome-call-reminder:${campaign._id}:revision-${campaign.revision}`;

export function WelcomeCallsNotifier({
  token,
  apiBaseUrl,
}: {
  token: string;
  apiBaseUrl: string;
}) {
  const [data, setData] = useState<QueueData>({
    leads: [],
    counts: {},
    campaigns: [],
  });
  const [loading, setLoading] = useState(true);
  const [, setError] = useState("");
  const startupSummaryShown = useRef(false);
  const range = "today";
  const dateFrom = "";
  const dateTo = "";

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const params = new URLSearchParams({
          includeClosed: "true",
          range,
        });
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        const response = await axios.get(
          `${apiBaseUrl}/welcome-calls/my-queue?${params}`,
          { headers },
        );
        setData(response.data.data as QueueData);
        setError("");
      } catch (requestError: any) {
        if (!quiet) {
          setError(
            requestError?.response?.data?.message ||
              "Welcome calls could not be loaded.",
          );
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [apiBaseUrl, headers, range, dateFrom, dateTo],
  );

  useEffect(() => {
    void refresh();
    // Live updates arrive over SSE; this is only a safety net.
    const fallbackRefresh = window.setInterval(
      () => void refresh(true),
      60_000,
    );
    return () => window.clearInterval(fallbackRefresh);
  }, [refresh]);

  useEffect(() => {
    const remaining = data.leads.filter((lead) => lead.canAct).length;
    if (loading || startupSummaryShown.current || remaining === 0) return;
    startupSummaryShown.current = true;
    notify(
      "Welcome calls remaining",
      `${remaining} ${remaining === 1 ? "call is" : "calls are"} still waiting in your queue.`,
    );
  }, [data.leads, loading]);

  useEffect(() => {
    const source = new EventSource(
      `${apiBaseUrl}/notifications/stream?token=${encodeURIComponent(token)}`,
    );
    const handleAssignment = (event: Event) => {
      const message = event as MessageEvent<string>;
      let payload: { title?: string; message?: string; count?: number } = {};
      try {
        payload = JSON.parse(message.data);
      } catch {
        payload = {};
      }
      notify(
        payload.title || "New welcome calls assigned",
        payload.message ||
          `${payload.count || 1} call(s) are ready in your queue.`,
      );
      void refresh(true);
    };
    source.addEventListener("welcome_call_assigned", handleAssignment);
    source.addEventListener("welcome_call_queue_updated", () => {
      void refresh(true);
    });
    const handleSheetMissing = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data);
        notify(
          payload.title || "Welcome-call sheet row missing",
          payload.message ||
            "A welcome call could not be matched in Google Sheets.",
        );
      } catch {}
    };
    source.addEventListener("welcome_call_sheet_missing", handleSheetMissing);
    return () => {
      source.removeEventListener("welcome_call_assigned", handleAssignment);
      source.removeEventListener(
        "welcome_call_sheet_missing",
        handleSheetMissing,
      );
      source.close();
    };
  }, [apiBaseUrl, refresh, token]);

  useEffect(() => {
    const checkReminders = () => {
      if (data.leads.length === 0) return;
      const now = new Date();
      data.leads
        .filter(
          (lead) =>
            lead.canAct &&
            lead.status === "CALLBACK" &&
            lead.nextCallAt &&
            new Date(lead.nextCallAt).getTime() <= now.getTime(),
        )
        .forEach((lead) => {
          const key = `welcome-call-callback:${lead._id}:${lead.nextCallAt}`;
          if (localStorage.getItem(key)) return;
          notify(
            "Welcome call due again",
            `${lead.registrantName} needs to be called again now (${lead.phone}).`,
            { clientName: lead.registrantName, clientPhone: lead.phone },
          );
          localStorage.setItem(key, now.toISOString());
        });
      const currentTime = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      data.campaigns.forEach((campaign) => {
        if (
          !campaign.isEffective ||
          !campaign.reminder.enabled ||
          currentTime < campaign.reminder.time
        ) {
          return;
        }
        const campaignPending = data.leads.filter(
          (lead) => lead.campaignId === campaign._id && lead.canAct,
        ).length;
        const storageKey = reminderStorageKey(campaign);
        if (campaignPending === 0 || localStorage.getItem(storageKey)) return;
        notify(
          "Pending welcome calls",
          `${campaignPending} ${campaignPending === 1 ? "call is" : "calls are"} still pending for ${campaign.name}.`,
        );
        localStorage.setItem(storageKey, new Date().toISOString());
      });
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 60_000);
    return () => window.clearInterval(timer);
  }, [data.campaigns, data.leads]);

  return null;
}
