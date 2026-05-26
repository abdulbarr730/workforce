import { dialog, shell, Notification } from "electron";
import axios from "axios";
import { authStore } from "./store/auth.store";

const API_URL = process.env.VITE_API_URL || "http://localhost:5000";
const POLL_INTERVAL_MS = 60_000;

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

function isAfterShiftEnd(shiftEndTime: string): boolean {
  const [h, m] = shiftEndTime.split(":").map(Number);
  if (isNaN(h)) return false;
  const now = new Date();
  const end = new Date();
  end.setHours(h, m || 0, 0, 0);
  return now.getTime() >= end.getTime();
}

function isTodayWorkingDay(activeDays: string[]): boolean {
  if (!activeDays || activeDays.length === 0) return true; // default: always a working day
  const today = todayShortDay(); // "Mon", "Tue", ...
  return activeDays.some((d) => d.toLowerCase().startsWith(today.toLowerCase().slice(0, 3)));
}

async function fetchShiftAndEod() {
  const token = authStore.get("token") as string | undefined;
  if (!token) return null;
  try {
    const [shiftRes, eodRes] = await Promise.all([
      axios.get(`${API_URL}/api/me/shift`, { headers: { Authorization: `Bearer ${token}` } }),
      axios.get(`${API_URL}/api/me/eod/today`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    return {
      shiftEndTime: shiftRes.data?.data?.shift?.shiftEndTime as string | undefined,
      activeDays: (shiftRes.data?.data?.shift?.activeDays ?? []) as string[],
      eod: eodRes.data?.data ?? null,
    };
  } catch {
    return null;
  }
}

async function showTimeUpDialog(shiftEndTime: string) {
  const day = todayStr();
  if (lastFiredForDay === day) return;
  lastFiredForDay = day;

  if (Notification.isSupported()) {
    new Notification({
      title: "Shift ended",
      body: `Your shift ended at ${shiftEndTime}. Submit your EOD report.`,
      urgency: "critical",
    }).show();
  }

  const result = await dialog.showMessageBox({
    type: "warning",
    title: "Time is up",
    message: "Submit your EOD — your shift has ended.",
    detail: `Your scheduled shift ended at ${shiftEndTime}. Submit your end-of-day report before logging out, or continue if you need more time.`,
    buttons: ["Submit EOD & Log out", "Keep working"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (result.response === 0) {
    const url =
      process.env.VITE_EMPLOYEE_DASHBOARD_URL ||
      "https://workforce-system-employee.vercel.app/dashboard";
    shell.openExternal(url);
  } else {
    acknowledgedForDay = day;
  }
}

async function tick() {
  const day = todayStr();
  if (acknowledgedForDay === day) return;

  const data = await fetchShiftAndEod();
  if (!data?.shiftEndTime) return;
  if (data.eod) return; // already submitted

  // Only fire on actual working days
  if (!isTodayWorkingDay(data.activeDays)) {
    console.log(`[ShiftWatcher] Today (${todayShortDay()}) is not a working day — skipping`);
    return;
  }

  if (isAfterShiftEnd(data.shiftEndTime)) {
    await showTimeUpDialog(data.shiftEndTime);
  }
}

export function startShiftWatcher() {
  if (timer) return;
  console.log("Shift watcher started");
  setTimeout(tick, 30_000);
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopShiftWatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
