/**
 * Read-only diagnosis of one employee's attendance/tracking for a day.
 * Changes nothing in the database.
 *
 *   node dist/scripts/diagnose-employee.js <employeeId> [YYYY-MM-DD]
 */
import mongoose from "mongoose";

import { env } from "../config/env";

const employeeId = process.argv[2];
const date =
  process.argv[3] ||
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );

const ist = (value: unknown) =>
  value
    ? new Date(value as string).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      })
    : "-";

const run = async () => {
  if (!employeeId) {
    console.log("Usage: node dist/scripts/diagnose-employee.js <employeeId> [YYYY-MM-DD]");
    process.exit(1);
  }
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const start = new Date(`${date}T00:00:00.000+05:30`);
  const end = new Date(`${date}T23:59:59.999+05:30`);

  const user = await db
    .collection("users")
    .findOne(
      { employeeId },
      {
        projection: {
          name: 1,
          isActive: 1,
          role: 1,
          assignedShiftPolicyId: 1,
          idleTimeoutMinutes: 1,
        },
      },
    );
  console.log(`\n=== ${employeeId} ${user?.name || "(user not found)"} on ${date}`);
  console.log("USER", JSON.stringify(user));

  const attendance = await db
    .collection("attendancerecords")
    .findOne({ employeeId, date });
  console.log(
    "ATTENDANCE",
    attendance
      ? JSON.stringify({
          status: attendance.attendanceStatus,
          login: ist(attendance.loginTime),
          logout: ist(attendance.logoutTime),
          loginOverridden: attendance.loginTimeOverridden,
          workedMin: attendance.totalWorkedMinutes,
          sessions: (attendance.sessions || []).length,
          updatedAt: ist(attendance.updatedAt),
        })
      : "none",
  );

  const sessions = await db
    .collection("worksessions")
    .find({ employeeId, loginAt: { $gte: start, $lte: end } })
    .sort({ loginAt: 1 })
    .toArray();
  console.log(
    "SESSIONS",
    JSON.stringify(
      sessions.map((s) => ({
        login: ist(s.loginAt),
        logout: ist(s.logoutAt),
        status: s.status,
        excluded: Boolean(s.excludedByAdmin),
      })),
    ),
  );

  const byType = await db
    .collection("activityevents")
    .aggregate([
      { $match: { employeeId, timestamp: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$type",
          n: { $sum: 1 },
          first: { $min: "$timestamp" },
          last: { $max: "$timestamp" },
          invalidated: { $sum: { $cond: ["$invalidated", 1, 0] } },
          versions: { $addToSet: "$metadata.agentVersion" },
          devices: { $addToSet: "$deviceId" },
          platforms: { $addToSet: "$metadata.platform" },
        },
      },
      { $sort: { first: 1 } },
    ])
    .toArray();
  console.log("EVENTS_BY_TYPE");
  for (const row of byType) {
    console.log(
      `  ${String(row._id).padEnd(22)} n=${String(row.n).padEnd(5)} first=${ist(row.first)} last=${ist(row.last)}` +
        `${row.invalidated ? ` invalidated=${row.invalidated}` : ""} v=${row.versions.join("/")} ${row.platforms.join("/")} dev=${row.devices.join(",")}`,
    );
  }

  const inputs = await db
    .collection("activityevents")
    .find({
      employeeId,
      type: { $in: ["USER_ACTIVITY", "LOGIN"] },
      timestamp: { $gte: start, $lte: end },
      invalidated: { $ne: true },
    })
    .project({ type: 1, timestamp: 1 })
    .sort({ timestamp: 1 })
    .toArray();
  const times = inputs.map((e) => new Date(e.timestamp).getTime());
  const confirmed = inputs.filter((e, i) =>
    times.some((t, j) => j !== i && Math.abs(t - times[i]) >= 30_000 && Math.abs(t - times[i]) <= 600_000),
  );
  console.log(
    `INPUT_PROOF total=${inputs.length} confirmed=${confirmed.length} firstConfirmed=${ist(confirmed[0]?.timestamp)}`,
  );

  const since = new Date(Date.now() - 14 * 864e5);
  const capable = await db
    .collection("activityevents")
    .countDocuments({ employeeId, type: "USER_ACTIVITY", timestamp: { $gte: since } });
  console.log(`USER_ACTIVITY_LAST_14_DAYS ${capable}`);

  const deviceIds = Array.from(
    new Set(byType.flatMap((row) => row.devices as string[])),
  );
  const lifecycle = await db
    .collection("deviceerrors")
    .find({
      $or: [{ employeeId }, { deviceId: { $in: deviceIds } }],
      createdAt: { $gte: new Date(Date.now() - 4 * 864e5) },
    })
    .project({ errorType: 1, errorMessage: 1, createdAt: 1, deviceId: 1 })
    .sort({ createdAt: 1 })
    .toArray();
  console.log("AGENT_LIFECYCLE_LAST_4_DAYS");
  for (const row of lifecycle) {
    console.log(
      `  ${ist(row.createdAt)} ${String(row.errorType).padEnd(40)} ${String(row.errorMessage || "").split("\n")[0].slice(0, 90)}`,
    );
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
