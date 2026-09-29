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
