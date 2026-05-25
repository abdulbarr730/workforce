import { dialog, shell, Notification } from "electron";
import axios from "axios";
import { authStore } from "./store/auth.store";

const API_URL = process.env.VITE_API_URL || "http://localhost:5000";
const POLL_INTERVAL_MS = 60_000; // check every minute

let timer: NodeJS.Timeout | null = null;
let acknowledgedForDay: string | null = null; // YYYY-MM-DD
let lastFiredForDay: string | null = null;

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function isAfterShiftEnd(shiftEndTime: string): boolean {
  const [h, m] = shiftEndTime.split(":").map(Number);
  if (isNaN(h)) return false;
  const now = new Date();
  const end = new Date();
  end.setHours(h, m || 0, 0, 0);
  return now.getTime() >= end.getTime();
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
      eod: eodRes.data?.data ?? null,
    };
  } catch {
    return null;
  }
}

async function showTimeUpDialog(shiftEndTime: string) {
  const day = todayStr();
  if (lastFiredForDay === day) return; // already shown once today
  lastFiredForDay = day;

  // Tray notification first
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
    detail: `Your scheduled shift ended at ${shiftEndTime}. You must submit your end-of-day report before logging out, or continue working if you need more time.`,
    buttons: ["Submit EOD & Log out", "Keep working"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (result.response === 0) {
    // Open the employee dashboard EOD flow in the default browser
    const url = (process.env.VITE_EMPLOYEE_DASHBOARD_URL || "")
      || "https://workforce-system-employee.vercel.app/dashboard";
    shell.openExternal(url);
  } else {
    acknowledgedForDay = day; // user chose to keep working — silence for the rest of today
  }
}

async function tick() {
  const day = todayStr();
  if (acknowledgedForDay === day) return;

  const data = await fetchShiftAndEod();
  if (!data?.shiftEndTime) return;
  if (data.eod) return; // already submitted today

  if (isAfterShiftEnd(data.shiftEndTime)) {
    await showTimeUpDialog(data.shiftEndTime);
  }
}

export function startShiftWatcher() {
  if (timer) return;
  console.log("Shift watcher started");
  // First check after 30s so the user can log in
  setTimeout(tick, 30_000);
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopShiftWatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
