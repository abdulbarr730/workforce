import { AttendanceRecord } from "../model/attendance-record.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { User } from "../../users/model/user.model";
import { computeAttendanceFromEvents } from "./compute-attendance.service";
import { getBusinessDate, getBusinessDayBounds } from "./shift-schedule.service";
import { mapWithConcurrency } from "../../../shared/utils/concurrency";

/**
 * Closes attendance days that were left without a logout time.
 *
 * Attendance is recomputed from telemetry uploads, so if an agent stops
 * sending (shut down, crashed, laptop left asleep) and next starts the
 * following day, the previous day is never recomputed and keeps an empty
 * logout. This job recomputes such days, which sets the logout to the last
 * real activity on the laptop:
 *  - any earlier day still open;
 *  - today, once there has been no real activity for 2 hours.
 * Admin-set logout times are never touched.
 */
const SWEEP_EVERY_MS = 10 * 60 * 1000;
const INACTIVE_AFTER_MS = 2 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 7;
const INPUT_TYPES = ["USER_ACTIVITY", "LOGIN"];
const REAL_ACTIVITY_TYPES = ["USER_ACTIVITY", "ACTIVE_WINDOW", "LOGIN"];

let running = false;

const daysAgo = (days: number) => {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return getBusinessDate(date);
};

export async function sweepOpenAttendance() {
  if (running) return;
  running = true;
  try {
    const today = getBusinessDate();
    const open = await AttendanceRecord.find({
      date: { $gte: daysAgo(LOOKBACK_DAYS), $lte: today },
      loginTime: { $ne: null },
      logoutTime: null,
      logoutTimeOverridden: { $ne: true },
    })
      .select("employeeId date")
      .lean();
    if (!open.length) return;

    const toClose: Array<{ employeeId: string; date: string }> = [];
    for (const record of open) {
      if (record.date < today) {
        toClose.push({ employeeId: record.employeeId, date: record.date });
        continue;
      }
      const { start, end } = getBusinessDayBounds(record.date);
      const latestOf = (types: string[]) =>
        ActivityEvent.findOne({
          employeeId: record.employeeId,
          type: { $in: types as any[] },
          invalidated: { $ne: true },
          timestamp: { $gte: start, $lte: end },
        })
          .select("timestamp")
          .sort({ timestamp: -1 })
          .lean();
      // Keyboard/mouse input first: an idle unlocked PC keeps re-reporting
      // its window every 5 minutes, which is not the employee being there.
      const latest =
        (await latestOf(INPUT_TYPES)) || (await latestOf(REAL_ACTIVITY_TYPES));
      if (
        latest &&
        Date.now() - new Date(latest.timestamp).getTime() >= INACTIVE_AFTER_MS
      ) {
        toClose.push({ employeeId: record.employeeId, date: record.date });
      }
    }
    if (!toClose.length) return;

    const users = await User.find({
      employeeId: { $in: toClose.map((row) => row.employeeId) },
    })
      .select("employeeId assignedShiftPolicyId")
      .lean();
    const shiftByEmployee = new Map(
      users.map((user) => [
        user.employeeId,
        String(user.assignedShiftPolicyId || ""),
      ]),
    );

    await mapWithConcurrency(toClose, 2, async (row) => {
      try {
        await computeAttendanceFromEvents({
          employeeId: row.employeeId,
          date: row.date,
          shiftPolicyId: shiftByEmployee.get(row.employeeId) || "",
        });
      } catch (error) {
        console.error(
          `[AttendanceSweeper] Could not close ${row.employeeId} ${row.date}:`,
          error,
        );
      }
    });
    console.log(
      `[AttendanceSweeper] Recomputed ${toClose.length} open attendance day(s).`,
    );
  } finally {
    running = false;
  }
}

export function startOpenAttendanceSweeper() {
  setTimeout(() => void sweepOpenAttendance(), 60_000).unref();
  setInterval(() => void sweepOpenAttendance(), SWEEP_EVERY_MS).unref();
}
