import { getBusinessDate } from "./shift-schedule.service";
import { User } from "../../users/model/user.model";
import { computeAttendanceFromEvents } from "./compute-attendance.service";
import { mapWithConcurrency } from "../../../shared/utils/concurrency";
import { AppError } from "../../../shared/utils/app-error";

/**
 * Plain business date "YYYY-MM-DD". Some older leave rows store an ISO
 * timestamp ("2026-09-04T00:00:00.000Z"); compared as text that sorts after
 * "2026-09-04", which made the first day of such a leave count as ABSENT.
 */
export const toDateKey = (value: unknown) => {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
};

export const todayKey = () => getBusinessDate();

export const datesBetween = (start: string, end: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last && dates.length < 400) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

/**
 * Once a request's date has passed, its decision is part of the record:
 * only a Super Admin may change it.
 */
export const assertRequestEditable = (
  requestDate: string,
  role: string | undefined,
) => {
  if (requestDate < todayKey() && role !== "SUPER_ADMIN") {
    throw new AppError(
      "This request's date has already passed, so it is locked.",
      403,
    );
  }
};

/**
 * Recalculates attendance for an employee's dates (up to today) after a
 * leave or correction changes, so the attendance page reflects it at once.
 */
export const recomputeAttendanceDates = async (
  employeeId: string,
  dates: string[],
) => {
  const today = todayKey();
  const due = dates.filter((date) => date <= today);
  if (!due.length) return;
  const user = await User.findOne({ employeeId })
    .select("assignedShiftPolicyId")
    .lean();
  await mapWithConcurrency(due, 2, (date) =>
    computeAttendanceFromEvents({
      employeeId,
      date,
      shiftPolicyId: String((user as any)?.assignedShiftPolicyId || ""),
    }).catch((error) =>
      console.error(`[Requests] Recompute failed for ${employeeId} ${date}:`, error),
    ),
  );
};
