import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { EmployeeDailyAnalytics } from "../model/employee-daily-analytics.model";

export const generateDailyAnalytics = async (
  companyId: string,
  employeeId: string,
  date: string
) => {
  /*
    Fetch day's events
  */
  const events = await ActivityEvent.find({
    companyId,
    employeeId,
    timestamp: {
      $gte: new Date(`${date}T00:00:00.000Z`),
      $lte: new Date(`${date}T23:59:59.999Z`)
    }
  }).lean();

  let productiveSeconds = 0;
  let unproductiveSeconds = 0;
  let neutralSeconds = 0;
  let idleSeconds = 0;

  const appMap: Record<string, number> = {};

  /*
    Carry forward department info
    If multiple events have different departments, pick the latest one
  */
  let departmentId: string | null = null;
  let departmentName: string | null = null;

  /*
    Assume each event represents 5 seconds
  */
  for (const event of events) {
    const category = event.productivityCategory;

    if (category === "PRODUCTIVE") {
      productiveSeconds += 5;
    } else if (category === "UNPRODUCTIVE") {
      unproductiveSeconds += 5;
    } else {
      neutralSeconds += 5;
    }

    if (event.type === "IDLE_START" || event.type === "IDLE_END") {
      idleSeconds += 5;
    }

    const app = event.metadata?.app || "UNKNOWN";
    appMap[app] = (appMap[app] || 0) + 5;

    // Update department info from event
    if (event.metadata?.departmentId) {
      departmentId = event.metadata.departmentId;
    }
    if (event.metadata?.departmentName) {
      departmentName = event.metadata.departmentName;
    }
  }

  const totalTrackedSeconds = productiveSeconds + unproductiveSeconds + neutralSeconds;

  /*
    Focus Score
  */
  const focusScore =
    totalTrackedSeconds === 0
      ? 0
      : Math.round((productiveSeconds / totalTrackedSeconds) * 100);

  /*
    Top apps
  */
  const topApps = Object.entries(appMap)
    .map(([app, seconds]) => ({ app, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10);

  /*
    Upsert analytics with department info
  */
  return await EmployeeDailyAnalytics.findOneAndUpdate(
    {
      companyId,
      employeeId,
      date
    },
    {
      companyId,
      employeeId,
      date,
      productiveSeconds,
      unproductiveSeconds,
      neutralSeconds,
      idleSeconds,
      totalTrackedSeconds,
      focusScore,
      topApps,
      departmentId,
      departmentName
    },
    {
      upsert: true,
      new: true
    }
  );
};