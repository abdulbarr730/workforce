/**
 * Recalculates attendance for one day from the stored telemetry, using the
 * current rules. Only the derived AttendanceRecord of each employee is
 * rewritten; admin-corrected login/logout times are kept, and nothing is
 * deleted.
 *
 *   node dist/scripts/recompute-day.js <YYYY-MM-DD> [employeeId ...]
 */
import mongoose from "mongoose";

import { env } from "../config/env";
import { UserRole } from "../_shared/constants";
import { User } from "../modules/users/model/user.model";
import { ShiftPolicy } from "../modules/attendance/model/shift-policy.model";
import { AttendanceRecord } from "../modules/attendance/model/attendance-record.model";
import { computeAttendanceFromEvents } from "../modules/attendance/services/compute-attendance.service";

const [date, ...onlyEmployees] = process.argv.slice(2);

const run = async () => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.log("Usage: node dist/scripts/recompute-day.js <YYYY-MM-DD> [employeeId ...]");
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

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
