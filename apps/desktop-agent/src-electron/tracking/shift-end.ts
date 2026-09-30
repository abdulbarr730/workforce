import { authStore } from "../store/auth.store";

// "End Shift" is remembered for the rest of the day (surviving sleep,
// restarts and shutdown). While it is set, no idle/away popup is shown and
// tracking stays off until the employee starts a new shift or a new day
// begins.

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function markShiftEnded() {
  authStore.set("shiftEndedDate", localDateKey());
}

export function clearShiftEnded() {
  authStore.set("shiftEndedDate", "");
}

export function isShiftEndedToday() {
  return authStore.get("shiftEndedDate") === localDateKey();
}

// ── Mark Attendance ──────────────────────────────────────────────────────
// When the company requires it, attendance (Present / Late / Half day) comes
// only from the employee clicking "Mark Attendance". Tracking and popups work
// as normal before and after the click.

export function setMarkState(state: { markRequired: boolean; startedToday: boolean }) {
  authStore.set("markRequired", Boolean(state.markRequired));
  if (state.startedToday) authStore.set("markStartedDate", localDateKey());
}

export function isAwaitingMarkToday() {
  return (
    authStore.get("markRequired") === true &&
    authStore.get("markStartedDate") !== localDateKey()
  );
}

/**
 * Off the clock: only after End Shift. Not having marked attendance yet does
 * not stop tracking or popups.
 */
export function isOffShift() {
  return isShiftEndedToday();
}

/**
 * The first time the laptop was opened or used today (from 5 AM; earlier
 * activity is the night before). Used as the login when attendance is marked
 * at a work location.
 */
export function recordLaptopOpen(at = new Date()) {
  if (at.getHours() < 5) return;
  const today = localDateKey(at);
  if (authStore.get("laptopOpenDate") === today) return;
  authStore.set("laptopOpenDate", today);
  authStore.set("laptopOpenAt", at.toISOString());
}

export function getLaptopOpenAt() {
  return authStore.get("laptopOpenDate") === localDateKey()
    ? authStore.get("laptopOpenAt") || null
    : null;
}
