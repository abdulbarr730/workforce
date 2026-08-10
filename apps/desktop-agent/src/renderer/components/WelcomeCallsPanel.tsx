import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import type {
  WelcomeCallCampaign,
  WelcomeCallLead,
  WelcomeCallOutcome,
} from "@workforce/shared-types";

type QueueLead = WelcomeCallLead & { campaignName?: string };
type QueueCampaign = Pick<
  WelcomeCallCampaign,
  "_id" | "name" | "reminder" | "revision"
> & { isEffective: boolean };
type QueueData = {
  leads: QueueLead[];
  counts: Record<string, number>;
  campaigns: QueueCampaign[];
};

const panel: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
};

const notify = (title: string, body: string) => {
  const electronApi = (window as any).electronAPI;
  if (electronApi?.showNotification) {
    electronApi.showNotification({ title, body, message: body });
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

const formatWhen = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString([], {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Today";

const outcomes: Array<{ value: WelcomeCallOutcome; label: string }> = [
  { value: "CONNECTED", label: "Connected" },
  { value: "NOT_CONNECTED", label: "Not connected" },
  { value: "CALLBACK", label: "Call again" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
  { value: "DO_NOT_CALL", label: "Do not call" },
];

export function WelcomeCallsPanel({
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<WelcomeCallOutcome>("CONNECTED");
  const [notes, setNotes] = useState("");
  const [nextCallAt, setNextCallAt] = useState("");
  const startupSummaryShown = useRef(false);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await axios.get(
          `${apiBaseUrl}/welcome-calls/my-queue`,
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
    [apiBaseUrl, headers],
  );

  useEffect(() => {
    void refresh();
    const fallbackRefresh = window.setInterval(
      () => void refresh(true),
      120_000,
    );
    return () => window.clearInterval(fallbackRefresh);
  }, [refresh]);

  useEffect(() => {
    if (loading || startupSummaryShown.current || data.leads.length === 0)
      return;
    startupSummaryShown.current = true;
    notify(
      "Welcome calls remaining",
      `${data.leads.length} ${data.leads.length === 1 ? "call is" : "calls are"} still waiting in your queue.`,
    );
  }, [data.leads.length, loading]);

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
    return () => {
      source.removeEventListener("welcome_call_assigned", handleAssignment);
      source.close();
    };
  }, [apiBaseUrl, refresh, token]);

  useEffect(() => {
    const checkReminders = () => {
      if (data.leads.length === 0) return;
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
          (lead) => lead.campaignId === campaign._id,
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

  const saveOutcome = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeLeadId) return;
    setSaving(true);
    try {
      await axios.patch(
        `${apiBaseUrl}/welcome-calls/leads/${activeLeadId}/outcome`,
        {
          outcome,
          notes,
          nextCallAt: outcome === "CALLBACK" ? nextCallAt : undefined,
        },
        { headers },
      );
      setActiveLeadId(null);
      setNotes("");
      setNextCallAt("");
      await refresh(true);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          "The call result could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1
          style={{ margin: 0, color: "#0f172a", fontSize: 19, fontWeight: 800 }}
        >
          Welcome calls
        </h1>
        <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 12 }}>
          Call your assigned webinar registrations and save each outcome.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {[
          ["Remaining", data.leads.length, "#2563eb"],
          ["Call again", data.counts.CALLBACK || 0, "#d97706"],
          ["Connected", data.counts.CONNECTED || 0, "#059669"],
        ].map(([label, count, color]) => (
          <div key={String(label)} style={{ ...panel, padding: 13 }}>
            <p
              style={{
                margin: 0,
                color: "#94a3b8",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {label}
            </p>
            <p
              style={{
                margin: "4px 0 0",
                color: String(color),
                fontSize: 23,
                fontWeight: 800,
              }}
            >
              {count}
            </p>
          </div>
        ))}
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: 9,
            padding: "10px 12px",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <section style={{ ...panel, overflow: "hidden" }}>
        <header
          style={{
            padding: "13px 15px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: 13,
                fontWeight: 750,
              }}
            >
              My pending queue
            </p>
            <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: 10 }}>
              {data.leads.length} call(s) waiting
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            style={{
              border: "1px solid #e2e8f0",
              background: "#fff",
              borderRadius: 8,
              padding: "7px 10px",
              color: "#475569",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        {loading && data.leads.length === 0 ? (
          <p
            style={{
              padding: 28,
              textAlign: "center",
              color: "#94a3b8",
              fontSize: 12,
            }}
          >
            Loading assigned calls...
          </p>
        ) : data.leads.length === 0 ? (
          <p
            style={{
              padding: 34,
              textAlign: "center",
              color: "#94a3b8",
              fontSize: 12,
            }}
          >
            No welcome calls are pending.
          </p>
        ) : (
          <div style={{ maxHeight: "calc(100vh - 310px)", overflowY: "auto" }}>
            {data.leads.map((lead) => {
              const active = activeLeadId === lead._id;
              return (
                <article
                  key={lead._id}
                  style={{ padding: 14, borderBottom: "1px solid #f1f5f9" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            color: "#0f172a",
                            fontSize: 13,
                            fontWeight: 750,
                          }}
                        >
                          {lead.registrantName}
                        </p>
                        <span
                          style={{
                            background:
                              lead.status === "CALLBACK"
                                ? "#fffbeb"
                                : "#eff6ff",
                            color:
                              lead.status === "CALLBACK"
                                ? "#b45309"
                                : "#1d4ed8",
                            padding: "2px 6px",
                            borderRadius: 999,
                            fontSize: 9,
                            fontWeight: 700,
                          }}
                        >
                          {lead.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: "3px 0 0",
                          color: "#64748b",
                          fontSize: 10,
                        }}
                      >
                        {lead.campaignName || "Welcome calls"} ·{" "}
                        {lead.email || "No email"}
                      </p>
                      <p
                        style={{
                          margin: "3px 0 0",
                          color: lead.nextCallAt ? "#d97706" : "#94a3b8",
                          fontSize: 10,
                          fontWeight: lead.nextCallAt ? 650 : 400,
                        }}
                      >
                        {lead.nextCallAt
                          ? `Call again ${formatWhen(lead.nextCallAt)}`
                          : `Registered ${formatWhen(lead.registeredAt)}`}
                      </p>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <a
                        href={`tel:${lead.phone}`}
                        style={{
                          borderRadius: 8,
                          padding: "7px 10px",
                          background: "#0d9488",
                          color: "#fff",
                          textDecoration: "none",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Call {lead.phone}
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveLeadId(active ? null : lead._id);
                          setError("");
                        }}
                        style={{
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                          borderRadius: 8,
                          padding: "7px 10px",
                          color: "#475569",
                          fontSize: 11,
                          fontWeight: 650,
                          cursor: "pointer",
                        }}
                      >
                        {active ? "Cancel" : "Result"}
                      </button>
                    </div>
                  </div>

                  {active ? (
                    <form
                      onSubmit={saveOutcome}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "160px 1fr auto",
                        gap: 8,
                        marginTop: 11,
                        padding: 10,
                        borderRadius: 9,
                        background: "#f8fafc",
                      }}
                    >
                      <select
                        value={outcome}
                        onChange={(event) =>
                          setOutcome(event.target.value as WelcomeCallOutcome)
                        }
                        style={{
                          border: "1px solid #cbd5e1",
                          borderRadius: 7,
                          padding: 7,
                          fontSize: 11,
                        }}
                      >
                        {outcomes.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {outcome === "CALLBACK" ? (
                        <input
                          required
                          type="datetime-local"
                          value={nextCallAt}
                          onChange={(event) =>
                            setNextCallAt(event.target.value)
                          }
                          aria-label="Call again date and time"
                          style={{
                            border: "1px solid #cbd5e1",
                            borderRadius: 7,
                            padding: 7,
                            fontSize: 11,
                          }}
                        />
                      ) : (
                        <input
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          placeholder="Optional notes"
                          aria-label="Call notes"
                          style={{
                            border: "1px solid #cbd5e1",
                            borderRadius: 7,
                            padding: 7,
                            fontSize: 11,
                          }}
                        />
                      )}
                      <button
                        type="submit"
                        disabled={saving}
                        style={{
                          border: 0,
                          borderRadius: 7,
                          background: "#0f172a",
                          color: "#fff",
                          padding: "7px 11px",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          opacity: saving ? 0.55 : 1,
                        }}
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      {outcome === "CALLBACK" ? (
                        <input
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          placeholder="Optional callback notes"
                          aria-label="Callback notes"
                          style={{
                            gridColumn: "1 / -1",
                            border: "1px solid #cbd5e1",
                            borderRadius: 7,
                            padding: 7,
                            fontSize: 11,
                          }}
                        />
                      ) : null}
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
