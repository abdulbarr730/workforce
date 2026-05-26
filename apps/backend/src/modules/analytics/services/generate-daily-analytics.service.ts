import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { EmployeeDailyAnalytics } from "../model/employee-daily-analytics.model";

export const generateDailyAnalytics = async (
  companyId: string,
  employeeId: string,
  date: string
) => {
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

  let departmentId: string | null = null;
  let departmentName: string | null = null;

  for (const event of events) {
    // Use actual durationSeconds if recorded by new tracker, else fall back to 5s
    const dur = (event.metadata as any)?.durationSeconds ?? 5;
    const category = event.productivityCategory;

    if (event.type === "ACTIVE_WINDOW") {
      if (category === "PRODUCTIVE") {
        productiveSeconds += dur;
      } else if (category === "UNPRODUCTIVE") {
        unproductiveSeconds += dur;
      } else {
        neutralSeconds += dur;
      }

      const app = (event.metadata as any)?.app || "UNKNOWN";
      appMap[app] = (appMap[app] || 0) + dur;
    }

    if (event.type === "IDLE_START" || event.type === "IDLE_END") {
      const idleDur =
        (event.metadata as any)?.idleDurationSecs ??
        (event.metadata as any)?.idleSeconds ??
        5;
      idleSeconds += idleDur;
    }

    if ((event.metadata as any)?.departmentId) {
      departmentId = (event.metadata as any).departmentId;
    }
    if ((event.metadata as any)?.departmentName) {
      departmentName = (event.metadata as any).departmentName;
    }
  }

  const totalTrackedSeconds = productiveSeconds + unproductiveSeconds + neutralSeconds;

  const focusScore =
    totalTrackedSeconds === 0
      ? 0
      : Math.round((productiveSeconds / totalTrackedSeconds) * 100);

  const topApps = Object.entries(appMap)
    .map(([app, seconds]) => ({ app, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10);

  return await EmployeeDailyAnalytics.findOneAndUpdate(
    { companyId, employeeId, date },
    {
      companyId, employeeId, date,
      productiveSeconds, unproductiveSeconds, neutralSeconds,
      idleSeconds, totalTrackedSeconds, focusScore, topApps,
      departmentId, departmentName
    },
    { upsert: true, new: true }
  );
};
