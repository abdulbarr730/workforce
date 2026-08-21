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

const formatWebinarDate = (value?: string | null) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Not grouped";

const outcomes: Array<{ value: WelcomeCallOutcome; label: string }> = [
  { value: "CONNECTED", label: "Connected" },
  { value: "NOT_CONNECTED", label: "Not connected" },
  { value: "CALLBACK", label: "Call again" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
  { value: "DO_NOT_CALL", label: "Do not call" },
];

const outcomeColor = (value: string) => {
  if (value === "CONNECTED")
    return { background: "#dcfce7", color: "#166534", border: "#86efac" };
  if (value === "NOT_CONNECTED")
    return { background: "#fee2e2", color: "#991b1b", border: "#fca5a5" };
  if (value === "CALLBACK")
    return { background: "#fef3c7", color: "#92400e", border: "#fcd34d" };
  return { background: "#fff", color: "#334155", border: "#cbd5e1" };
};

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
  const [saveNotice, setSaveNotice] = useState("");
  const [error, setError] = useState("");
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<WelcomeCallOutcome>("CONNECTED");
  const [notes, setNotes] = useState("");
  const [nextCallAt, setNextCallAt] = useState("");
  const [range, setRange] = useState<
    "today" | "yesterday" | "previous" | "all"
  >("today");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [copiedField, setCopiedField] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const startupSummaryShown = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await axios.get(
          `${apiBaseUrl}/welcome-calls/my-queue?includeClosed=true&range=${range}`,
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
    [apiBaseUrl, headers, range],
  );

  useEffect(() => {
    void refresh();
    const fallbackRefresh = window.setInterval(
      () => void refresh(true),
      15_000,
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

  const persistOutcome = async (leadId: string, clear = false) => {
    setSaving(true);
    setSaveNotice("Saving...");
    try {
      await axios.patch(
        `${apiBaseUrl}/welcome-calls/leads/${leadId}/outcome`,
        clear
          ? { clear: true }
          : {
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
      setSaveNotice(clear ? "Result cleared" : "Saved");
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          "The call result could not be saved.",
      );
      setSaveNotice("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveOutcome = async (event: React.FormEvent) => {
    event.preventDefault();
    if (activeLeadId) await persistOutcome(activeLeadId);
  };

  useEffect(() => {
    if (!activeLeadId || outcome === "CALLBACK") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistOutcome(activeLeadId);
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
    if (activeLeadId && !saving) void persistOutcome(activeLeadId);
  };

  const saveRowNotes = async (lead: QueueLead) => {
    if (!(lead._id in noteDrafts)) return;
    const notesValue =
      noteDrafts[lead._id] ?? lead.callAttempts?.at(-1)?.notes ?? "";
    if (notesValue.trim() === (lead.callAttempts?.at(-1)?.notes || "").trim()) {
      return;
    }
    if (!["CONNECTED", "NOT_CONNECTED", "CALLBACK"].includes(lead.status)) {
      setError("Select a call result before adding notes.");
      return;
    }
    setSaving(true);
    setSaveNotice("Saving notes...");
    try {
      await axios.patch(
        `${apiBaseUrl}/welcome-calls/leads/${lead._id}/outcome`,
        { notesOnly: true, notes: notesValue },
        { headers },
      );
      setSaveNotice("Notes saved");
      setError("");
      await refresh(true);
    } catch (requestError: any) {
      setSaveNotice("Save failed");
      setError(
        requestError?.response?.data?.message || "Notes could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const copyValue = async (key: string, value?: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedField(key);
    window.setTimeout(() => setCopiedField(""), 1_500);
  };

  const campaignOptions = new Map(
    data.campaigns.map((campaign) => [
      campaign._id,
      campaign.outcomeOptions?.length
        ? campaign.outcomeOptions
        : (["CONNECTED", "NOT_CONNECTED", "CALLBACK"] as WelcomeCallOutcome[]),
    ]),
  );
  const campaignColumns = new Map(
    data.campaigns.map((campaign) => [
      campaign._id,
      campaign.customColumns || [],
    ]),
  );
  const visibleColumns = Array.from(
    new Map(
      data.campaigns
        .flatMap((campaign) => campaign.customColumns || [])
        .map((column) => [column.key, column]),
    ).values(),
  );

  const saveCustomField = async (
    leadId: string,
    key: string,
    value: string,
  ) => {
    setSaveNotice("Saving...");
    try {
      await axios.patch(
        `${apiBaseUrl}/welcome-calls/leads/${leadId}/custom-fields`,
        { values: { [key]: value } },
        { headers },
      );
      setSaveNotice("Saved");
      await refresh(true);
    } catch {
      setSaveNotice("Save failed");
    }
  };
  const visibleOutcomeChoices = outcomes.filter((option) =>
    Array.from(campaignOptions.values()).some((options) =>
      options.includes(option.value),
    ),
  );
  const searchKey = search.trim().toLowerCase();
  const visibleLeads = data.leads.filter((lead) => {
    if (statusFilter && lead.status !== statusFilter) return false;
    if (!searchKey) return true;
    return [
      lead.registrantName,
      lead.email,
      lead.phone,
      lead.source,
      lead.webinarDate,
      lead.assignedToEmployeeName,
      lead.callAttempts?.at(-1)?.notes,
    ].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(searchKey),
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1
          style={{ margin: 0, color: "#0f172a", fontSize: 19, fontWeight: 800 }}
        >
          Welcome calls
        </h1>
        <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 12 }}>
          See exactly when each call was assigned and keep the full history
          searchable.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          alignSelf: "flex-end",
          background: "#f1f5f9",
          padding: 4,
          borderRadius: 9,
        }}
      >
        {(
          [
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["previous", "Previous"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setRange(value)}
            style={{
              border: 0,
              borderRadius: 7,
              padding: "6px 10px",
              background: range === value ? "#fff" : "transparent",
              color: range === value ? "#0f172a" : "#64748b",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow:
                range === value ? "0 1px 2px rgba(15,23,42,.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, phone, webinar..."
          aria-label="Search welcome calls"
          style={{
            width: 260,
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            padding: "7px 10px",
            background: "#fff",
            color: "#334155",
            fontSize: 10,
          }}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter welcome calls by status"
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            padding: "7px 10px",
            background: "#fff",
            color: "#475569",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          {visibleOutcomeChoices.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {[
          [
            "Remaining",
            data.leads.filter(
              (lead) => lead.assignedToEmployeeId && lead.status === "PENDING",
            ).length,
            "#2563eb",
          ],
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

      {saveNotice ? (
        <div
          role="status"
          style={{
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
            borderRadius: 9,
            padding: "8px 12px",
            fontSize: 11,
            fontWeight: 650,
          }}
        >
          {saveNotice}
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
              My welcome calls
            </p>
            <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: 10 }}>
              {data.leads.length} call(s) shown · Remaining means no result yet
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
        ) : visibleLeads.length === 0 ? (
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
          <div
            style={{
              maxHeight: "calc(100vh - 310px)",
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `220px 170px 170px 145px ${visibleColumns.map(() => "150px").join(" ")} 150px minmax(190px, 1fr)`,
                minWidth: 1045 + visibleColumns.length * 150,
                gap: 0,
                padding: "9px 12px",
                position: "sticky",
                top: 0,
                zIndex: 2,
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                color: "#64748b",
                fontSize: 9,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              <span>Person</span>
              <span>Phone number</span>
              <span>Webinar date</span>
              <span>Assigned at</span>
              {visibleColumns.map((column) => (
                <span key={column.key}>{column.label}</span>
              ))}
              <span>Status</span>
              <span>Notes</span>
            </div>
            {visibleLeads.map((lead) => {
              const active = activeLeadId === lead._id;
              return (
                <article
                  key={lead._id}
                  style={{
                    minWidth: 1045 + visibleColumns.length * 150,
                    padding: "0 12px 10px",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `220px 170px 170px 145px ${visibleColumns.map(() => "150px").join(" ")} 150px minmax(190px, 1fr)`,
                      alignItems: "center",
                      minHeight: 52,
                      color: "#334155",
                      fontSize: 10,
                    }}
                  >
                    <div style={{ minWidth: 0, paddingRight: 10 }}>
                      <button
                        type="button"
                        onClick={() =>
                          void copyValue(
                            `name-${lead._id}`,
                            lead.registrantName,
                          )
                        }
                        title="Click to copy name"
                        style={{
                          display: "block",
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          color: "#0f172a",
                          fontSize: 11,
                          fontWeight: 750,
                          cursor: "copy",
                        }}
                      >
                        {copiedField === `name-${lead._id}`
                          ? "Copied"
                          : lead.registrantName}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void copyValue(`email-${lead._id}`, lead.email)
                        }
                        title="Click to copy email"
                        style={{
                          display: "block",
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          border: 0,
                          background: "transparent",
                          padding: "3px 0 0",
                          color: "#64748b",
                          fontSize: 9,
                          cursor: lead.email ? "copy" : "default",
                        }}
                      >
                        {lead.email || "No email"}
                      </button>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <a
                        href={`tel:${lead.phone}`}
                        title="Call"
                        style={{
                          color: "#0f766e",
                          fontWeight: 750,
                          textDecoration: "none",
                        }}
                      >
                        ☎ {lead.phone}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          void copyValue(`phone-${lead._id}`, lead.phone)
                        }
                        title="Copy phone"
                        style={{
                          border: 0,
                          background: "transparent",
                          color: "#64748b",
                          cursor: "copy",
                          fontSize: 9,
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <div>
                      <span style={{ display: "block", fontWeight: 650 }}>
                        {formatWebinarDate(lead.webinarDate)}
                      </span>
                      <span
                        style={{
                          color: "#2563eb",
                          fontSize: 8,
                          fontWeight: 700,
                        }}
                      >
                        {String(lead.source || "").toUpperCase()}
                      </span>
                    </div>
                    <span style={{ fontWeight: 650 }}>
                      {lead.assignedAt
                        ? formatWhen(lead.assignedAt)
                        : "Not assigned"}
                    </span>
                    {visibleColumns.map((column) => {
                      const available = (
                        campaignColumns.get(lead.campaignId) || []
                      ).find((candidate) => candidate.key === column.key);
                      const value = String(
                        (
                          lead.metadata?.customFields as
                            | Record<string, unknown>
                            | undefined
                        )?.[column.key] || "",
                      );
                      if (!available) return <span key={column.key}>—</span>;
                      return available.options.length ? (
                        <select
                          key={column.key}
                          value={value}
                          disabled={!lead.canEdit}
                          onChange={(event) =>
                            void saveCustomField(
                              lead._id,
                              column.key,
                              event.target.value,
                            )
                          }
                          style={{
                            width: "calc(100% - 8px)",
                            border: "1px solid #cbd5e1",
                            borderRadius: 7,
                            padding: "7px 8px",
                            cursor: lead.canEdit ? "pointer" : "default",
                            background:
                              available.optionColors?.[value] || "#fff",
                            color: "#334155",
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          <option value="">Blank</option>
                          {available.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          key={column.key}
                          defaultValue={value}
                          disabled={!lead.canEdit}
                          onBlur={(event) => {
                            if (event.target.value !== value)
                              void saveCustomField(
                                lead._id,
                                column.key,
                                event.target.value,
                              );
                          }}
                          style={{
                            width: "calc(100% - 8px)",
                            boxSizing: "border-box",
                            border: "1px solid #cbd5e1",
                            borderRadius: 7,
                            padding: "7px 8px",
                            fontSize: 10,
                          }}
                        />
                      );
                    })}
                    {lead.canEdit ? (
                      (() => {
                        const selectedOutcome = active
                          ? outcome
                          : ["CONNECTED", "NOT_CONNECTED", "CALLBACK"].includes(
                                lead.status,
                              )
                            ? lead.status
                            : "";
                        const colors = outcomeColor(selectedOutcome);
                        return (
                      <select
                        aria-label={`Select result for ${lead.registrantName}`}
                        value={selectedOutcome}
                        onChange={(event) => {
                          const selected = event.target.value;
                          if (selected === "__CLEAR__") {
                            void persistOutcome(lead._id, true);
                            return;
                          }
                          if (!selected) return;
                          setActiveLeadId(lead._id);
                          setOutcome(selected as WelcomeCallOutcome);
                          setNotes(lead.callAttempts?.at(-1)?.notes || "");
                          setNextCallAt("");
                          setError("");
                        }}
                        style={{
                          width: 140,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 999,
                          padding: "6px 8px",
                          background: colors.background,
                          color: colors.color,
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        <option value="" disabled>
                          Result
                        </option>
                        <option value="__CLEAR__">Blank / pending</option>
                        {outcomes
                          .filter((option) =>
                            (
                              campaignOptions.get(lead.campaignId) || [
                                "CONNECTED",
                                "NOT_CONNECTED",
                                "CALLBACK",
                              ]
                            ).includes(option.value),
                          )
                          .map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              style={{
                                background: outcomeColor(option.value).background,
                                color: outcomeColor(option.value).color,
                              }}
                            >
                              {option.label}
                            </option>
                          ))}
                      </select>
                        );
                      })()
                    ) : (
                      <span
                        style={{
                          fontWeight: 750,
                          padding: "5px 8px",
                          borderRadius: 999,
                          background: outcomeColor(lead.status).background,
                          color: outcomeColor(lead.status).color,
                        }}
                      >
                        {lead.status.replaceAll("_", " ")}
                      </span>
                    )}
                    <input
                      value={
                        noteDrafts[lead._id] ??
                        lead.callAttempts?.at(-1)?.notes ??
                        ""
                      }
                      onChange={(event) =>
                        setNoteDrafts((current) => ({
                          ...current,
                          [lead._id]: event.target.value,
                        }))
                      }
                      onBlur={() => void saveRowNotes(lead)}
                      placeholder="Add notes"
                      aria-label={`Notes for ${lead.registrantName}`}
                      style={{
                        width: "calc(100% - 8px)",
                        border: "1px solid #e2e8f0",
                        borderRadius: 6,
                        padding: "6px 8px",
                        color: "#475569",
                        background: "#fff",
                        fontSize: 10,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "none",
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
                        <button
                          type="button"
                          onClick={() =>
                            void copyValue(
                              `name-${lead._id}`,
                              lead.registrantName,
                            )
                          }
                          title="Copy name"
                          style={{
                            border: 0,
                            background: "transparent",
                            color: "#64748b",
                            padding: "2px 3px",
                            fontSize: 9,
                            cursor: "pointer",
                          }}
                        >
                          {copiedField === `name-${lead._id}`
                            ? "Copied"
                            : "Copy name"}
                        </button>
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
                        {lead.email || "No email"}{" "}
                        {lead.email ? (
                          <button
                            type="button"
                            onClick={() =>
                              void copyValue(`email-${lead._id}`, lead.email)
                            }
                            title="Copy email"
                            style={{
                              border: 0,
                              background: "transparent",
                              color: "#2563eb",
                              padding: "1px 3px",
                              fontSize: 9,
                              cursor: "pointer",
                            }}
                          >
                            {copiedField === `email-${lead._id}`
                              ? "Copied"
                              : "Copy email"}
                          </button>
                        ) : null}
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
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          borderRadius: 8,
                          padding: "7px 10px",
                          background: "#0d9488",
                          color: "#fff",
                          textDecoration: "none",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        <span aria-hidden="true">☎</span>
                        Call {lead.phone}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          void copyValue(`phone-${lead._id}`, lead.phone)
                        }
                        title="Copy phone number"
                        style={{
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          padding: "7px 8px",
                          background: "#fff",
                          color: "#475569",
                          fontSize: 9,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {copiedField === `phone-${lead._id}`
                          ? "Copied"
                          : "Copy"}
                      </button>
                      {lead.canEdit ? (
                        (() => {
                          const selectedOutcome = active
                            ? outcome
                            : ["CONNECTED", "NOT_CONNECTED", "CALLBACK"].includes(
                                  lead.status,
                                )
                              ? lead.status
                              : "";
                          const colors = outcomeColor(selectedOutcome);
                          return (
                        <select
                          aria-label={`Select result for ${lead.registrantName}`}
                          value={selectedOutcome}
                          onChange={(event) => {
                            const selected = event.target.value;
                            if (selected === "__CLEAR__") {
                              void persistOutcome(lead._id, true);
                              return;
                            }
                            if (!selected) return;
                            setActiveLeadId(lead._id);
                            setOutcome(selected as WelcomeCallOutcome);
                            setNotes("");
                            setNextCallAt("");
                            setError("");
                          }}
                          style={{
                            border: `1px solid ${colors.border}`,
                            background: colors.background,
                            borderRadius: 8,
                            padding: "7px 10px",
                            color: colors.color,
                            fontSize: 11,
                            fontWeight: 650,
                            cursor: "pointer",
                          }}
                        >
                          <option value="" disabled>
                            Result
                          </option>
                          <option value="__CLEAR__">
                            Blank / reset to original
                          </option>
                          {outcomes
                            .filter((option) =>
                              (
                                campaignOptions.get(lead.campaignId) || [
                                  "CONNECTED",
                                  "NOT_CONNECTED",
                                  "CALLBACK",
                                ]
                              ).includes(option.value),
                            )
                            .map((option) => (
                              <option
                                key={option.value}
                                value={option.value}
                                style={{
                                  background: outcomeColor(option.value).background,
                                  color: outcomeColor(option.value).color,
                                }}
                              >
                                {option.label}
                              </option>
                            ))}
                        </select>
                          );
                        })()
                      ) : (
                        <span
                          style={{
                            borderRadius: 8,
                            padding: "7px 10px",
                            background: "#f1f5f9",
                            color: "#64748b",
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          Recorded
                        </span>
                      )}
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
                      <div
                        style={{
                          alignSelf: "center",
                          color: "#475569",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {
                          outcomes.find((option) => option.value === outcome)
                            ?.label
                        }
                      </div>
                      {outcome === "CALLBACK" ? (
                        <input
                          required
                          type="datetime-local"
                          value={nextCallAt}
                          onChange={(event) =>
                            setNextCallAt(event.target.value)
                          }
                          onBlur={saveOnBlur}
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
                          onFocus={pauseAutoSave}
                          onBlur={saveOnBlur}
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
                      <div
                        style={{
                          borderRadius: 7,
                          background: "#fff",
                          color: "#64748b",
                          padding: "7px 11px",
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: "center",
                        }}
                      >
                        {saving ? "Saving..." : "Auto-saves in 2 seconds"}
                      </div>
                      {outcome === "CALLBACK" ? (
                        <input
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          onFocus={pauseAutoSave}
                          onBlur={saveOnBlur}
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
