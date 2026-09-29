/**
 * Recalculates attendance for one day from the stored telemetry, using the
 * current rules. Only the derived AttendanceRecord of each employee is
 * rewritten; admin-corrected login/logout times are kept, and nothing is
 * deleted.
 *
 *   node dist/scripts/recompute-day.js <YYYY-MM-DD> [employeeId ...]
 *   node dist/scripts/recompute-day.js <FROM> <TO> [employeeId ...]
 *
 * Use a range to re-apply current rules to past days in one go (e.g. fix
 * old 12:00 AM logouts to the last real activity for everyone).
 */
import mongoose from "mongoose";

import { env } from "../config/env";
import { UserRole } from "../_shared/constants";
import { User } from "../modules/users/model/user.model";
import { ShiftPolicy } from "../modules/attendance/model/shift-policy.model";
import { AttendanceRecord } from "../modules/attendance/model/attendance-record.model";
import { computeAttendanceFromEvents } from "../modules/attendance/services/compute-attendance.service";

const args = process.argv.slice(2);
const isDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
const fromDate = args[0];
const toDate = isDate(args[1]) ? args[1] : args[0];
const onlyEmployees = args.slice(isDate(args[1]) ? 2 : 1);

const datesInRange = (from: string, to: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const last = new Date(`${to}T12:00:00Z`);
  while (cursor <= last && dates.length < 400) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const run = async () => {
  if (!isDate(fromDate) || !isDate(toDate) || toDate < fromDate) {
    console.log("Usage: node dist/scripts/recompute-day.js <FROM> [TO] [employeeId ...]");
    process.exit(1);
  }
  await mongoose.connect(env.MONGO_URI);

  const defaultShift = await ShiftPolicy.findOne({ isDefault: true }).lean();
  const employees = await User.find({
    isActive: true,
    role: { $nin: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
    ...(onlyEmployees.length ? { employeeId: { $in: onlyEmployees } } : {}),
  })
    .select("employeeId name assignedShiftPolicyId")
    .sort({ employeeId: 1 })
    .lean();

  for (const date of datesInRange(fromDate, toDate)) {
  console.log(`\n=== ${date}`);
  for (const employee of employees) {
    const before = await AttendanceRecord.findOne({
      employeeId: employee.employeeId,
      date,
    }).lean();
    try {
      await computeAttendanceFromEvents({
        employeeId: employee.employeeId,
        date,
        shiftPolicyId: String(
          employee.assignedShiftPolicyId || defaultShift?._id || "",
        ),
      });
      const after = await AttendanceRecord.findOne({
        employeeId: employee.employeeId,
        date,
      }).lean();
      const fmt = (value: unknown) =>
        value
          ? new Date(value as string).toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
            })
          : "--:--";
      const changed =
        before?.attendanceStatus !== after?.attendanceStatus ||
        String(before?.loginTime || "") !== String(after?.loginTime || "");
      console.log(
        `${String(employee.employeeId).padEnd(16)}${String(employee.name).slice(0, 20).padEnd(22)}` +
          `${String(before?.attendanceStatus || "none").padEnd(9)} ${fmt(before?.loginTime)}  ->  ` +
          `${String(after?.attendanceStatus || "none").padEnd(9)} ${fmt(after?.loginTime)}` +
          (changed ? "   (changed)" : ""),
      );
    } catch (error) {
      console.log(
        `${employee.employeeId}: failed - ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
