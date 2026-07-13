import { EmployeeDailyAnalytics } from "../model/employee-daily-analytics.model";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { resolveProductivityRule } from "../../productivity-rules/services/resolve-productivity-rule.service";
import { User } from "../../users/model/user.model";
import { DailyTodo } from "../../daily-flow/model/daily-todo.model";
import { EodReport } from "../../daily-flow/model/eod-report.model";

export const getTeamIntelligence = async (
  startDate: string,
  endDate: string,
  employeeId?: string,
) => {
  const queryAnalytics: any = {
    date: { $gte: startDate, $lte: endDate },
  };
  const queryAttendance: any = {
    date: { $gte: startDate, $lte: endDate },
  };

  if (employeeId) {
    queryAnalytics.employeeId = employeeId;
    queryAttendance.employeeId = employeeId;
  }

  const [analytics, attendance, todos, eods] = await Promise.all([
    EmployeeDailyAnalytics.find(queryAnalytics).lean(),
    AttendanceRecord.find(queryAttendance).lean(),
    DailyTodo.find(queryAnalytics).lean(),
    EodReport.find(queryAnalytics).lean(),
  ]);

  const allUsers = await User.find({}).lean();
  const userMap = new Map(allUsers.map((u) => [u.employeeId, u.name]));

  // 1. Aggregation Maps
  const empStats = new Map<
    string,
    {
      name: string;
      productiveSeconds: number;
      unproductiveSeconds: number;
      focusScoreTotal: number;
      daysTracked: number;
      lateDays: number;
      presentDays: number;
      overtimeMinutes: number;
      shiftCompletedDays: number;
      todosSubmitted: number;
      eodsSubmitted: number;
    }
  >();

  const distractingAppsTotal = new Map<string, number>();
  const productiveAppsTotal = new Map<string, number>();

  let totalProdMins = 0;
  let totalNonProdMins = 0;
  let totalOtMins = 0;
  let totalLate = 0;
  let totalPresent = 0;

  // Process Attendance
  for (const att of attendance) {
    totalProdMins += att.productiveMinutes || 0;
    totalNonProdMins += (att.breakMinutes || 0) + (att.idleMinutes || 0);
    totalOtMins += att.overtimeMinutes || 0;
    if (att.attendanceStatus === "LATE") totalLate++;
    if (["PRESENT", "LATE", "HALF_DAY"].includes(att.attendanceStatus))
      totalPresent++;

    if (!empStats.has(att.employeeId)) {
      empStats.set(att.employeeId, {
        name: att.employeeName || userMap.get(att.employeeId) || att.employeeId,
        productiveSeconds: 0,
        unproductiveSeconds: 0,
        focusScoreTotal: 0,
        daysTracked: 0,
        lateDays: 0,
        presentDays: 0,
        overtimeMinutes: 0,
        shiftCompletedDays: 0,
        todosSubmitted: 0,
        eodsSubmitted: 0,
      });
    }
    const st = empStats.get(att.employeeId)!;
    if (att.attendanceStatus === "LATE") st.lateDays++;
    if (["PRESENT", "LATE", "HALF_DAY"].includes(att.attendanceStatus))
      st.presentDays++;
    st.overtimeMinutes += att.overtimeMinutes || 0;

    // Shift completed if productiveMinutes > 7h (420m) - heuristic
    if ((att.productiveMinutes || 0) >= 420) {
      st.shiftCompletedDays++;
    }
  }

  // Process Analytics
  for (const an of analytics) {
    if (!empStats.has(an.employeeId)) {
      empStats.set(an.employeeId, {
        name: userMap.get(an.employeeId) || an.employeeId,
        productiveSeconds: 0,
        unproductiveSeconds: 0,
        focusScoreTotal: 0,
        daysTracked: 0,
        lateDays: 0,
        presentDays: 0,
        overtimeMinutes: 0,
        shiftCompletedDays: 0,
        todosSubmitted: 0,
        eodsSubmitted: 0,
      });
    }
    const st = empStats.get(an.employeeId)!;
    st.productiveSeconds += an.productiveSeconds || 0;
    st.unproductiveSeconds += an.unproductiveSeconds || 0;
    st.focusScoreTotal += an.focusScore || 0;
    st.daysTracked++;

    for (const app of an.topApps || []) {
      const rule = await resolveProductivityRule({
        companyId: "default",
        employeeId: an.employeeId,
        appName: app.app,
        title: "",
      });

      if (rule.productivityCategory === "UNPRODUCTIVE") {
        distractingAppsTotal.set(
          app.app,
          (distractingAppsTotal.get(app.app) || 0) + app.seconds,
        );
      } else if (rule.productivityCategory === "PRODUCTIVE") {
        productiveAppsTotal.set(
          app.app,
          (productiveAppsTotal.get(app.app) || 0) + app.seconds,
        );
      }
    }
  }

  // Process Daily Flow (Todos & EODs)
  for (const t of todos) {
    if (!empStats.has(t.employeeId)) continue;
    empStats.get(t.employeeId)!.todosSubmitted++;
  }
  for (const e of eods) {
    if (!empStats.has(e.employeeId)) continue;
    empStats.get(e.employeeId)!.eodsSubmitted++;
  }

  const employeeList = Array.from(empStats.entries()).map(([id, st]) => {
    const eodsMissed = Math.max(0, st.presentDays - st.eodsSubmitted);
    return {
      employeeId: id,
      name: st.name,
      avgFocusScore:
        st.daysTracked > 0
          ? Math.round(st.focusScoreTotal / st.daysTracked)
          : 0,
      productiveHours: Number((st.productiveSeconds / 3600).toFixed(2)),
      unproductiveHours: Number((st.unproductiveSeconds / 3600).toFixed(2)),
      lateDays: st.lateDays,
      presentDays: st.presentDays,
      shiftCompletedDays: st.shiftCompletedDays,
      overtimeHours: Number((st.overtimeMinutes / 60).toFixed(2)),
      todosSubmitted: st.todosSubmitted,
      eodsSubmitted: st.eodsSubmitted,
      eodsMissed,
    };
  });

  const needsAttention = [...employeeList]
    .filter((e) => e.unproductiveHours > 5 || e.lateDays > 2)
    .sort((a, b) => b.unproductiveHours - a.unproductiveHours)
    .slice(0, 10);

  const latecomers = [...employeeList]
    .filter((e) => e.lateDays > 0)
    .sort((a, b) => b.lateDays - a.lateDays)
    .slice(0, 10);

  const topPerformers = [...employeeList]
    .filter((e) => e.presentDays > 0)
    .sort((a, b) => {
      const scoreA =
        a.avgFocusScore + a.shiftCompletedDays * 10 - a.lateDays * 20;
      const scoreB =
        b.avgFocusScore + b.shiftCompletedDays * 10 - b.lateDays * 20;
      return scoreB - scoreA;
    })
    .slice(0, 10);

  const topUnproductiveLinks = Array.from(distractingAppsTotal.entries())
    .map(([app, seconds]) => ({
      app,
      hours: Number((seconds / 3600).toFixed(2)),
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 15);

  const topProductiveLinks = Array.from(productiveAppsTotal.entries())
    .map(([app, seconds]) => ({
      app,
      hours: Number((seconds / 3600).toFixed(2)),
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 15);

  // Compliance Metrics
  let totalTodos = 0;
  let totalEods = 0;
  for (const st of empStats.values()) {
    totalTodos += st.todosSubmitted;
    totalEods += st.eodsSubmitted;
  }

  const missedOneDay = employeeList.filter((e) => e.eodsMissed === 1);
  const missedMultipleDays = employeeList.filter((e) => e.eodsMissed >= 2);

  return {
    overview: {
      totalProdMins: Math.round(totalProdMins),
      totalNonProdMins: Math.round(totalNonProdMins),
      totalOtMins: Math.round(totalOtMins),
      totalLate,
      totalPresent,
      totalTodos,
      totalEods,
      debug: {
        startDate,
        endDate,
        attendanceCount: attendance.length,
        analyticsCount: analytics.length,
        firstAtt: attendance[0] ? attendance[0].date : null,
      },
    },
    needsAttention,
    latecomers,
    topPerformers,
    topUnproductiveLinks,
    topProductiveLinks,
    compliance: {
      missedOneDay,
      missedMultipleDays,
    },
    employeeList,
  };
};
