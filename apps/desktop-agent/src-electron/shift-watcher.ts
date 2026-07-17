import { app, dialog, shell, Notification } from "electron";
import axios from "axios";
import { authStore } from "./store/auth.store";
import { trackingState } from "./tracking/tracking-state";
import { getDeviceId } from "./tracking/device-info";

const API_URL = app.isPackaged
  ? "https://hr.prosyncedu.com/api"
  : "http://localhost:5000/api";
const POLL_INTERVAL_MS = 15_000;

let timer: NodeJS.Timeout | null = null;
let acknowledgedForDay: string | null = null;
let lastFiredForDay: string | null = null;

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// Returns "Mon", "Tue", etc. matching backend activeDays format
function todayShortDay(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "short" });
}

function isAfterShiftEnd(expectedLogoutTimeISO: string): boolean {
  if (!expectedLogoutTimeISO) return false;
  const now = new Date();
  const end = new Date(expectedLogoutTimeISO);
  return now.getTime() >= end.getTime();
}

function isTodayWorkingDay(activeDays: string[]): boolean {
  if (!activeDays || activeDays.length === 0) return true; // default: always a working day
  const today = todayShortDay(); // "Mon", "Tue", ...
  return activeDays.some((d) =>
    d.toLowerCase().startsWith(today.toLowerCase().slice(0, 3)),
  );
}

async function fetchShiftAndEod() {
  const token = authStore.get("token") as string | undefined;
  if (!token) return null;
  try {
    const [shiftRes, eodRes, statsRes] = await Promise.all([
      axios.get(`${API_URL}/me/shift`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-device-id": getDeviceId(),
        },
      }),
      axios.get(`${API_URL}/me/eod/today`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      axios.get(`${API_URL}/analytics/live?date=${todayStr()}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    return {
      shiftEndTime: shiftRes.data?.data?.shift?.shiftEndTime as
        | string
        | undefined,
      expectedLogoutTime: statsRes.data?.data?.expectedLogoutTime as
        | string
        | undefined,
      activeDays: (shiftRes.data?.data?.shift?.activeDays ?? []) as string[],
      idleTimeoutMinutes: shiftRes.data?.data?.idleTimeoutMinutes as
        | number
        | undefined,
      forceLogout: shiftRes.data?.data?.forceLogout as boolean | undefined,
      eod: eodRes.data?.data ?? null,
    };
  } catch {
    return null;
  }
}

async function showTimeUpDialog(shiftEndTime: string, hasEod: boolean) {
  const day = todayStr();
  if (lastFiredForDay === day) return;
  lastFiredForDay = day;

  if (Notification.isSupported()) {
    new Notification({
      title: hasEod ? "EOD Submitted, Logout Pending" : "Shift ended",
      body: hasEod
        ? "You have submitted your EOD but are still logged in."
        : `Your shift ended at ${shiftEndTime}. Submit your EOD report.`,
      urgency: "critical",
    }).show();
  }

  const result = await dialog.showMessageBox({
    type: "warning",
    title: "Time is up",
    message: hasEod ? "EOD submitted but no logout" : "No EOD submitted",
    detail: hasEod
      ? `You have already submitted your EOD report for today. Please click "Log out / Sleep" in the agent to stop tracking and end your session, or keep working if needed.`
      : `Your expected logout time has been reached. Submit your end-of-day report before logging out, or continue if you need more time.`,
    buttons: hasEod
      ? ["Got it", "Keep working"]
      : ["Open Agent EOD", "Keep working"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (result.response === 0 && !hasEod) {
    import("electron").then(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send("shift:open-eod");
        if (w.isMinimized()) w.restore();
        w.setAlwaysOnTop(true);
        w.show();
        w.focus();
        w.setAlwaysOnTop(false);
      });
    });
  } else {
    acknowledgedForDay = day;
  }
}

async function tick() {
  const day = todayStr();
  if (acknowledgedForDay === day) return;

  // If the user already logged out (put agent to sleep), we don't need to alert them about shift end
  if (trackingState.isTrackingPaused) return;

  const data = await fetchShiftAndEod();

  if (data?.forceLogout) {
    import("electron").then(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send("auth:force-logout"),
      );
    });
    authStore.clear();
    return;
  }

  // Update dynamic idle timeout if provided by the backend (default to 5 mins if not)
  if (data?.idleTimeoutMinutes !== undefined) {
    trackingState.idleTimeoutSecs = data.idleTimeoutMinutes * 60;
  } else {
    trackingState.idleTimeoutSecs = 300;
  }

  // Prefer the dynamic expectedLogoutTime from live stats; fallback to static shiftEndTime (which might not trigger correctly for late entries, but provides a safety net)
  const logoutTarget = data?.expectedLogoutTime;
  if (!logoutTarget && !data?.shiftEndTime) return;

  // Only fire on actual working days
  if (!isTodayWorkingDay(data?.activeDays || [])) {
    console.log(
      `[ShiftWatcher] Today (${todayShortDay()}) is not a working day — skipping`,
    );
    return;
  }

  // Check expectedLogoutTime first (ISO string)
  if (logoutTarget && isAfterShiftEnd(logoutTarget)) {
    await showTimeUpDialog(logoutTarget, !!data?.eod);
  }
  // Fallback to static shiftEndTime (HH:MM string) only if expectedLogoutTime is completely missing
  else if (!logoutTarget && data?.shiftEndTime) {
    const [h, m] = data.shiftEndTime.split(":").map(Number);
    const end = new Date();
    end.setHours(h, m || 0, 0, 0);
    if (new Date().getTime() >= end.getTime()) {
      await showTimeUpDialog(data.shiftEndTime, !!data?.eod);
    }
  }
}

export function startShiftWatcher() {
  if (timer) return;
  console.log("Shift watcher started");
  setTimeout(tick, 5_000); // Start the first fetch sooner
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function forceShiftCheck() {
  tick();
}

export function stopShiftWatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
