import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { EmployeeDailyAnalytics } from "../model/employee-daily-analytics.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";

export const generateDailyAnalytics = async (
  companyId: string,
  employeeId: string,
  date: string,
) => {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const now = new Date();
  const sessions = await WorkSession.find({
    employeeId,
    loginAt: { $lte: dayEnd },
    $or: [{ logoutAt: null }, { logoutAt: { $gte: dayStart } }],
  })
    .select("loginAt logoutAt")
    .lean();
  const sessionRanges = sessions.map((session) => ({
    timestamp: {
      $gte: new Date(Math.max(dayStart.getTime(), session.loginAt.getTime())),
      $lte: new Date(
        Math.min(dayEnd.getTime(), new Date(session.logoutAt || now).getTime()),
      ),
    },
  }));
  // Execute all math at the Database level using an Aggregation Pipeline.
  // This prevents the Node.js memory crash and calculates exact time using event metadata.
  const statsResult = await ActivityEvent.aggregate([
    {
      $match: {
        companyId,
        employeeId,
        invalidated: { $ne: true },
        ...(sessionRanges.length ? { $or: sessionRanges } : { _id: null }),
      },
    },
    {
      $facet: {
        // 1. Calculate productivity based on exact duration logic
        categories: [
          { $match: { type: "ACTIVE_WINDOW" } },
          {
            $group: {
              _id: "$productivityCategory",
              // Pull actual duration from agent, fallback to 30 seconds. Cap at 305s to prevent sleep anomalies.
              totalSeconds: {
                $sum: {
                  $min: [{ $ifNull: ["$metadata.durationSeconds", 30] }, 305],
                },
              },
            },
          },
        ],
        // 2. Extract Top 10 Apps
        apps: [
          { $match: { type: "ACTIVE_WINDOW" } },
          {
            $group: {
              _id: { $ifNull: ["$metadata.app", "UNKNOWN"] },
              seconds: {
                $sum: {
                  $min: [{ $ifNull: ["$metadata.durationSeconds", 30] }, 305],
                },
              },
            },
          },
          { $sort: { seconds: -1 } },
          { $limit: 10 },
        ],
        // 3. Extract latest Department Info
        department: [
          { $match: { "metadata.departmentId": { $exists: true } } },
          { $sort: { timestamp: -1 } },
          { $limit: 1 },
          {
            $project: {
              _id: 0,
              deptId: "$metadata.departmentId",
              deptName: "$metadata.departmentName",
            },
          },
        ],
      },
    },
  ]);

  const facetData = statsResult[0];

  // Map category results safely
  let productiveSeconds = 0;
  let unproductiveSeconds = 0;
  let neutralSeconds = 0;

  facetData.categories.forEach((cat: any) => {
    if (cat._id === "PRODUCTIVE") productiveSeconds = cat.totalSeconds;
    if (cat._id === "UNPRODUCTIVE") unproductiveSeconds = cat.totalSeconds;
    if (cat._id === "NEUTRAL") neutralSeconds = cat.totalSeconds;
  });

  let topApps = facetData.apps.map((app: any) => ({
    app: app._id,
    seconds: app.seconds,
  }));

  const latestDept = facetData.department[0] || {};
  const departmentId = latestDept.deptId || null;
  const departmentName = latestDept.deptName || null;

  let totalTrackedSeconds =
    productiveSeconds + unproductiveSeconds + neutralSeconds;
  const sessionElapsedSeconds = sessionRanges.reduce((total, range) => {
    const start = range.timestamp.$gte.getTime();
    const end = range.timestamp.$lte.getTime();
    return total + Math.max(0, (end - start) / 1000);
  }, 0);
  if (
    totalTrackedSeconds > sessionElapsedSeconds &&
    sessionElapsedSeconds > 0
  ) {
    const scale = sessionElapsedSeconds / totalTrackedSeconds;
    productiveSeconds = Math.round(productiveSeconds * scale);
    unproductiveSeconds = Math.round(unproductiveSeconds * scale);
    neutralSeconds = Math.round(neutralSeconds * scale);
    topApps = topApps.map((app: any) => ({
      ...app,
      seconds: Math.round(app.seconds * scale),
    }));
    totalTrackedSeconds =
      productiveSeconds + unproductiveSeconds + neutralSeconds;
  }
  const focusScore =
    totalTrackedSeconds === 0
      ? 0
      : Math.round(100 - (unproductiveSeconds / totalTrackedSeconds) * 100);

  // Upsert the perfectly calculated data
  return await EmployeeDailyAnalytics.findOneAndUpdate(
    { companyId, employeeId, date },
    {
      companyId,
      employeeId,
      date,
      productiveSeconds,
      unproductiveSeconds,
      neutralSeconds,
      idleSeconds: 0, // Requires complex timeline matching, leaving 0 until timeline orchestrator is built
      totalTrackedSeconds,
      focusScore,
      topApps,
      departmentId,
      departmentName,
    },
    { upsert: true, returnDocument: "after" },
  );
};
