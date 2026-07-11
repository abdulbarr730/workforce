import { EmployeeDailyAnalytics } from "../model/employee-daily-analytics.model";
import { resolveProductivityRule } from "../../productivity-rules/services/resolve-productivity-rule.service";

export const getTeamAnalytics = async (
  date: string,
  departmentId?: string,
  unproductiveThresholdMins: number = 30,
) => {
  const query: any = {
    date,
  };

  if (departmentId) {
    query.departmentId = departmentId;
  }

  const analytics = await EmployeeDailyAnalytics.find(query).lean();

  let totalFocusScore = 0;
  let totalProductiveSeconds = 0;
  let totalIdleSeconds = 0;
  let totalUnproductiveSeconds = 0;
  const employeeStats: any[] = [];
  const distractingApps: Record<string, number> = {};

  for (const item of analytics) {
    totalFocusScore += item.focusScore || 0;
    totalProductiveSeconds += item.productiveSeconds || 0;
    totalIdleSeconds += item.idleSeconds || 0;
    totalUnproductiveSeconds += item.unproductiveSeconds || 0;

    employeeStats.push({
      employeeId: item.employeeId,
      focusScore: item.focusScore || 0,
      productiveSeconds: item.productiveSeconds || 0,
      unproductiveSeconds: item.unproductiveSeconds || 0,
      topApps: item.topApps || [],
    });

    for (const app of item.topApps || []) {
      distractingApps[app.app] = (distractingApps[app.app] || 0) + app.seconds;
    }
  }

  const employeeCount = analytics.length;
  const averageFocusScore =
    employeeCount === 0 ? 0 : Math.round(totalFocusScore / employeeCount);

  const topEmployees = [...employeeStats]
    .sort((a, b) => b.focusScore - a.focusScore)
    .slice(0, 10);

  // Fetch rules to check app-wise allowances
  const needsAttention: any[] = [];

  for (const e of employeeStats) {
    let flagged = false;

    // 1. Global threshold check
    if (e.unproductiveSeconds > unproductiveThresholdMins * 60) {
      flagged = true;
    } else {
      // 2. App-wise allowance check
      for (const app of e.topApps) {
        const rule = await resolveProductivityRule({
          companyId: "default",
          employeeId: e.employeeId,
          appName: app.app,
          title: "",
        });

        if (
          rule.productivityCategory === "UNPRODUCTIVE" &&
          rule.allowanceMinutes !== undefined
        ) {
          if (app.seconds > rule.allowanceMinutes * 60) {
            flagged = true;
            break;
          }
        }
      }
    }

    if (flagged) {
      needsAttention.push(e);
    }
  }

  needsAttention.sort((a, b) => b.unproductiveSeconds - a.unproductiveSeconds);

  const topDistractingApps = Object.entries(distractingApps)
    .map(([app, seconds]) => ({ app, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10);

  return {
    employeeCount,
    averageFocusScore,
    totalProductiveHours: Number((totalProductiveSeconds / 3600).toFixed(2)),
    totalIdleHours: Number((totalIdleSeconds / 3600).toFixed(2)),
    totalUnproductiveHours: Number(
      (totalUnproductiveSeconds / 3600).toFixed(2),
    ),
    topEmployees,
    needsAttention,
    topDistractingApps,
  };
};
