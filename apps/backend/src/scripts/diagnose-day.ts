/**
 * Read-only attendance report for every active employee on one day: stored
 * status next to the evidence the agent sent. Changes nothing.
 *
 *   node dist/scripts/diagnose-day.js [YYYY-MM-DD]
 */
import mongoose from "mongoose";

import { env } from "../config/env";

const date =
  process.argv[2] ||
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );

const time = (value: unknown) =>
  value
    ? new Date(value as string).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

const run = async () => {
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const start = new Date(`${date}T00:00:00.000+05:30`);
  const end = new Date(`${date}T23:59:59.999+05:30`);

  const users = await db
    .collection("users")
    .find({ isActive: true, role: { $nin: ["SUPER_ADMIN", "ADMIN"] } })
    .project({ employeeId: 1, name: 1, assignedShiftPolicyId: 1, workingDays: 1 })
    .sort({ employeeId: 1 })
    .toArray();
  const records = await db.collection("attendancerecords").find({ date }).toArray();
  const byEmployee = new Map(records.map((r) => [r.employeeId, r]));

  const evidence = await db
    .collection("activityevents")
    .aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          invalidated: { $ne: true },
          type: { $in: ["USER_ACTIVITY", "ACTIVE_WINDOW", "LOGIN", "SESSION_START"] },
        },
      },
      {
        $group: {
          _id: "$employeeId",
          inputs: { $sum: { $cond: [{ $eq: ["$type", "USER_ACTIVITY"] }, 1, 0] } },
          firstInput: {
            $min: { $cond: [{ $eq: ["$type", "USER_ACTIVITY"] }, "$timestamp", null] },
          },
          lastInput: {
            $max: { $cond: [{ $eq: ["$type", "USER_ACTIVITY"] }, "$timestamp", null] },
          },
          agentStart: {
            $min: { $cond: [{ $eq: ["$type", "SESSION_START"] }, "$timestamp", null] },
          },
          windowSeconds: {
            $sum: {
              $cond: [
                { $eq: ["$type", "ACTIVE_WINDOW"] },
                { $min: [{ $ifNull: ["$metadata.durationSeconds", 30] }, 305] },
                0,
              ],
            },
          },
          versions: { $addToSet: "$metadata.agentVersion" },
        },
      },
    ])
    .toArray();
  const evidenceBy = new Map(evidence.map((e) => [e._id, e]));

  const shiftIds = Array.from(
    new Set(users.map((u) => String(u.assignedShiftPolicyId || "")).filter(Boolean)),
  );
  const shifts = await db
    .collection("shiftpolicies")
    .find({ _id: { $in: shiftIds.map((id) => new mongoose.Types.ObjectId(id)) } })
    .project({ name: 1, activeDays: 1, halfDayAfterTime: 1, absentAfterTime: 1, minimumWorkMinutes: 1 })
    .toArray();
  const shiftBy = new Map(shifts.map((s) => [String(s._id), s]));

  console.log(`\nAttendance on ${date} (${new Date(`${date}T12:00:00Z`).toUTCString().slice(0, 3)})`);
  console.log(
    "employee".padEnd(16) + "name".padEnd(22) + "stored".padEnd(10) + "login".padEnd(7) +
      "1stInput".padEnd(9) + "lastIn".padEnd(8) + "agentUp".padEnd(8) + "inputs".padEnd(7) +
      "winMin".padEnd(7) + "shift(absentAfter/min/days)",
  );
  for (const user of users) {
    const record = byEmployee.get(user.employeeId);
    const e = evidenceBy.get(user.employeeId);
    const shift = shiftBy.get(String(user.assignedShiftPolicyId || ""));
    const flag =
      e && e.inputs > 0 && (!record || record.attendanceStatus === "ABSENT")
        ? "  <== present evidence but ABSENT"
        : "";
    console.log(
      String(user.employeeId).padEnd(16) +
        String(user.name || "").slice(0, 20).padEnd(22) +
        String(record?.attendanceStatus || "none").padEnd(10) +
        time(record?.loginTime).padEnd(7) +
        time(e?.firstInput).padEnd(9) +
        time(e?.lastInput).padEnd(8) +
        time(e?.agentStart).padEnd(8) +
        String(e?.inputs || 0).padEnd(7) +
        String(Math.round((e?.windowSeconds || 0) / 60)).padEnd(7) +
        (shift
          ? `${shift.name} (${shift.absentAfterTime || "13:30"}/${shift.minimumWorkMinutes || 120}/${(shift.activeDays || []).map((d: string) => d.slice(0, 2)).join("")})`
          : "no shift") +
        ` v${(e?.versions || []).join("/")}` +
        flag,
    );
  }
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
