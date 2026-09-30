import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

export type MarkRecord = {
  _id: string;
  status: "WAITING_LOCATION" | "PENDING_APPROVAL" | "REJECTED" | "MARKED";
  laptopOpenAt?: string | null;
  markedAt?: string | null;
  loginTime?: string | null;
  locationName?: string | null;
  method?: string | null;
  remoteReason?: string | null;
  remoteDecisionNote?: string | null;
};

export type MarkStatus = {
  date: string;
  markRequired: boolean;
  locationRequired: boolean;
  locations: string[];
  mark: MarkRecord | null;
};

const electronApi = () => (window as any).electronAPI;

const clock = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

const errorText = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.message || fallback;

/** Where the laptop is: agent (Wi-Fi, Windows location) + browser GPS (Mac). */
async function readLocation() {
  let reading: any = {};
  try {
    reading = (await electronApi()?.getDeviceLocation?.()) || {};
  } catch {
    reading = {};
  }
  if (reading.latitude == null && typeof navigator !== "undefined" && navigator.geolocation) {
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          reading.latitude = pos.coords.latitude;
          reading.longitude = pos.coords.longitude;
          reading.accuracyMeters = Math.round(pos.coords.accuracy);
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
      );
    });
  }
  return {
    latitude: reading.latitude ?? null,
    longitude: reading.longitude ?? null,
    accuracyMeters: reading.accuracyMeters ?? null,
    wifiName: reading.wifiName ?? null,
  };
}

/**
 * Today's Mark Attendance state. Keeps the agent's "nothing recorded until
 * started" state in step, and while waiting for a work location checks every
 * few minutes whether the employee has arrived.
 */
export function useMarkAttendance(token: string | null, api: string) {
  const [status, setStatus] = useState<MarkStatus | null>(null);
  const headers = { Authorization: `Bearer ${token}` };
  const statusRef = useRef<MarkStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return null;
    try {
      const res = await axios.get(`${api}/attendance/mark/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const next = res.data?.data as MarkStatus;
      setStatus(next);
      statusRef.current = next;
      await electronApi()?.setMarkState?.({
        markRequired: Boolean(next?.markRequired),
        startedToday: Boolean(next?.mark),
      });
      return next;
    } catch {
      return statusRef.current; // offline: keep what we knew
    }
  }, [api, token]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  /** Is the employee at a work location now? Marks the arrival time if so. */
  const checkNow = useCallback(async () => {
    if (!token) return;
    try {
      const location = await readLocation();
      const res = await axios.post(`${api}/attendance/mark/check`, location, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const mark = res.data?.data as MarkRecord;
      setStatus((s) => (s ? { ...s, mark } : s));
    } catch {
      /* try again next time */
    }
  }, [api, token]);

  // Waiting for a work location: check every 3 minutes.
  const waiting =
    status?.mark && status.mark.status !== "MARKED" && status.locationRequired;
  useEffect(() => {
    if (!waiting) return;
    const first = window.setTimeout(() => void checkNow(), 20_000);
    const timer = window.setInterval(() => void checkNow(), 3 * 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [checkNow, waiting]);

  /** Start & Mark Attendance. */
  const mark = useCallback(async () => {
    const laptopOpenAt = await electronApi()?.getLaptopOpenAt?.();
    const location = statusRef.current?.locationRequired ? await readLocation() : {};
    const res = await axios.post(
      `${api}/attendance/mark`,
      { laptopOpenAt, ...location },
      { headers },
    );
    const next = await refresh();
    // Start recording for the day.
    await electronApi()?.startTracking?.();
    return { message: res.data?.message as string, status: next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, refresh, token]);

  /** Working from another location: reason goes to an admin. */
  const requestRemote = useCallback(
    async (reason: string) => {
      const location = await readLocation();
      const res = await axios.post(
        `${api}/attendance/mark/remote`,
        { reason, ...location },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await refresh();
      return res.data?.message as string;
    },
    [api, refresh, token],
  );

  return { status, refresh, mark, requestRemote, checkNow };
}

// ── Screens ──────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  fontFamily: "'Inter',system-ui,sans-serif",
  background: "#0f172a",
  color: "#fff",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  textAlign: "center",
};
const primary: React.CSSProperties = {
  padding: "14px 26px",
  borderRadius: 10,
  background: "#10b981",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 700,
};

/** New day: nothing is recorded until the employee starts here. */
export function MarkAttendanceGate({
  status,
  onMark,
}: {
  status: MarkStatus;
  onMark: () => Promise<{ message: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openAt, setOpenAt] = useState<string | null>(null);
  useEffect(() => {
    electronApi()?.getLaptopOpenAt?.().then((v: string) => setOpenAt(v)).catch(() => undefined);
  }, []);

  return (
    <div style={shell}>
      <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 8px" }}>☀️ Good morning</h1>
      <p style={{ color: "#94a3b8", margin: "0 0 6px" }}>
        Laptop opened at <b style={{ color: "#fff" }}>{clock(openAt)}</b>
      </p>
      <p style={{ color: "#94a3b8", margin: "0 0 26px", maxWidth: 460 }}>
        {status.locationRequired
          ? `Your attendance is marked at your work location (${status.locations.join(", ")}). If you are already there, the time you opened the laptop is your login.`
          : "Start your day to mark your attendance. The time you opened the laptop is your login."}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onMark();
          } catch (e) {
            setError(errorText(e, "Could not mark attendance. Check your internet and try again."));
          } finally {
            setBusy(false);
          }
        }}
        style={{ ...primary, opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Checking location…" : "▶ Start & Mark Attendance"}
      </button>
      {error ? (
        <p style={{ color: "#fca5a5", marginTop: 16, fontWeight: 600, maxWidth: 460 }}>{error}</p>
      ) : null}
      <p style={{ color: "#64748b", fontSize: 12, marginTop: 22, maxWidth: 460 }}>
        Nothing is recorded until you start.
      </p>
    </div>
  );
}

/** Shown on the dashboard until today's attendance is marked. */
export function MarkStatusBanner({
  status,
  onRequestRemote,
  onRetry,
}: {
  status: MarkStatus;
  onRequestRemote: (reason: string) => Promise<string>;
  onRetry: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const mark = status.mark;
  if (!status.markRequired || !mark) return null;

  if (mark.status === "MARKED") {
    return (
      <div style={{ ...box, background: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534" }}>
        ✅ Attendance marked — login {clock(mark.loginTime)}
        {mark.method === "REMOTE"
          ? " (working from another location, approved)"
          : mark.locationName
            ? ` at ${mark.locationName}`
            : ""}
      </div>
    );
  }

  return (
    <div style={{ ...box, background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
      {mark.status === "PENDING_APPROVAL" ? (
        <div>
          ⏳ <b>Waiting for admin approval</b> to work from this location. Your reason: “
          {mark.remoteReason}”. If you reach your work location first, attendance is marked then.
        </div>
      ) : (
        <div>
          📍 <b>You are not at your work location yet</b> ({status.locations.join(", ")}). Your
          attendance will be marked when you arrive.
          {mark.status === "REJECTED" ? (
            <div style={{ color: "#b91c1c", marginTop: 4 }}>
              Your request to work from elsewhere was not approved
              {mark.remoteDecisionNote ? `: ${mark.remoteDecisionNote}` : ""}.
            </div>
          ) : null}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onRetry} style={smallButton}>
          I&apos;m here — check again
        </button>
        {mark.status !== "PENDING_APPROVAL" ? (
          <button type="button" onClick={() => setOpen((o) => !o)} style={smallButton}>
            Working from somewhere else?
          </button>
        ) : null}
      </div>
      {open && mark.status !== "PENDING_APPROVAL" ? (
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>
            Reason <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError("");
            }}
            rows={2}
            placeholder="e.g. Client visit / working from home today"
            style={{
              width: "100%",
              borderRadius: 8,
              border: `1px solid ${error ? "#f87171" : "#fcd34d"}`,
              padding: 8,
              fontFamily: "inherit",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          {error ? (
            <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 700, marginTop: 4 }}>{error}</div>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (reason.trim().length < 5) {
                setError("Reason is required: say why you are working from this location.");
                return;
              }
              setBusy(true);
              try {
                await onRequestRemote(reason.trim());
                setOpen(false);
                setReason("");
              } catch (e) {
                setError(errorText(e, "Could not send. Try again."));
              } finally {
                setBusy(false);
              }
            }}
            style={{ ...smallButton, marginTop: 8, background: "#d97706", color: "#fff", border: "none" }}
          >
            {busy ? "Sending…" : "Send to admin for approval"}
          </button>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Your attendance is marked when an admin approves it.
          </div>
        </div>
      ) : null}
    </div>
  );
}

const box: React.CSSProperties = {
  border: "1px solid",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13,
  marginBottom: 14,
  lineHeight: 1.5,
};
const smallButton: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #fcd34d",
  background: "#fff",
  color: "#92400e",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
