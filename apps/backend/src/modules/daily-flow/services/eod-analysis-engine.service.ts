import { User } from "../../users/model/user.model";
import { DailyTodo } from "../model/daily-todo.model";
import { EodReport } from "../model/eod-report.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";

export interface EmployeeDailyAnalysis {
  employeeId: string;
  name: string;
  department: string | null;
  date: string;
  loginTime: string | null;
  logoutTime: string | null;
  shiftHours: number; // in hours
  totalLoggedHours: number; // in hours from checkins/EOD
  timeAdherenceRate: number; // percentage
  plannedTasksCount: number;
  completedTasksCount: number;
  completionRate: number; // percentage
  checkinsCount: number;
  expectedCheckinsCount: number;
  missedCheckinCount: number;
  top3Tasks: string[];
  blockers: string;
  timeline: Array<{
    interval: string;
    tasks: string[];
    durationStr: string;
    durationMinutes: number;
    source: "CHECKIN" | "EOD" | "MISSED";
  }>;
  eodSubmitted: boolean;
  todoSubmitted: boolean;
  insights: string;
}

export interface TeamDailyFlowAnalysis {
  date: string;
  generatedAt: string;
  totalEmployees: number;
  todoSubmittedCount: number;
  eodSubmittedCount: number;
  avgCompletionRate: number;
  avgLoggedHours: number;
  avgTimeAdherence: number;
  totalMissedCheckins: number;
  employees: EmployeeDailyAnalysis[];
  teamHighlights: string[];
}

// In-memory cache for fast retrieval of daily reports
const analysisCache = new Map<string, TeamDailyFlowAnalysis>();

export function parseDurationToHours(val: string): number {
  if (!val) return 0;
  const str = val.toLowerCase().trim();
  let mins = 0;
  if (str.includes("h") || str.includes("m")) {
    const hMatch = str.match(/([\d.]+)\s*h/);
    const mMatch = str.match(/([\d.]+)\s*m/);
    if (hMatch) mins += parseFloat(hMatch[1]) * 60;
    if (mMatch) mins += parseFloat(mMatch[1]);
    return +(mins / 60).toFixed(2);
  }
  if (str.includes(":")) {
    const parts = str.split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return +((h * 60 + m) / 60).toFixed(2);
  }
  const num = parseFloat(str);
  if (!isNaN(num)) return +num.toFixed(2);
  return 0;
}

export async function runDailyFlowAnalysisEngine(
  targetDate?: string,
  targetEmployeeId?: string,
): Promise<TeamDailyFlowAnalysis> {
  const date = targetDate || new Date().toISOString().split("T")[0];
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const userQuery: any = {
    isActive: true,
    role: { $nin: ["SUPER_ADMIN", "ADMIN"] },
  };
  if (targetEmployeeId && targetEmployeeId !== "ALL") {
    userQuery.employeeId = targetEmployeeId;
  }

  const [users, todos, eods, sessions, attendanceRecords] = await Promise.all([
    User.find(userQuery).lean(),
    DailyTodo.find({ date }).lean(),
    EodReport.find({ date }).lean(),
    WorkSession.find({ loginAt: { $gte: startOfDay, $lte: endOfDay } }).lean(),
    AttendanceRecord.find({ date }).lean(),
  ]);

  const employeeAnalyses: EmployeeDailyAnalysis[] = users.map((u) => {
    const todo = todos.find((t) => t.employeeId === u.employeeId);
    const eod = eods.find((e) => e.employeeId === u.employeeId);
    const userSessions = sessions
      .filter((s) => s.employeeId === u.employeeId)
      .sort((a, b) => new Date(a.loginAt).getTime() - new Date(b.loginAt).getTime());
    const attendance = attendanceRecords.find((a) => a.employeeId === u.employeeId);

    const loginTime: string | null = attendance?.loginTime
      ? typeof attendance.loginTime === "string"
        ? attendance.loginTime
        : new Date(attendance.loginTime).toISOString()
      : userSessions.length > 0
      ? new Date(userSessions[0].loginAt).toISOString()
      : null;

    const logoutTime: string | null = attendance?.logoutTime
      ? typeof attendance.logoutTime === "string"
        ? attendance.logoutTime
        : new Date(attendance.logoutTime).toISOString()
      : userSessions.length > 0 && userSessions[userSessions.length - 1].logoutAt
      ? new Date(userSessions[userSessions.length - 1].logoutAt!).toISOString()
      : null;

    let shiftHours = 0;
    if (loginTime) {
      const startMs = new Date(loginTime).getTime();
      const endMs = logoutTime ? new Date(logoutTime).getTime() : Date.now();
      shiftHours = Math.max(0, +((endMs - startMs) / (1000 * 60 * 60)).toFixed(2));
    }

    const plannedItems = todo?.items || [];
    const plannedTasksCount = plannedItems.length;

    // Build chronological timeline from checkins and EOD
    const timeline: EmployeeDailyAnalysis["timeline"] = [];
    let totalLoggedHours = 0;

    // 1. Process 2-hour Check-ins
    const checkins = todo?.checkins || [];
    checkins.forEach((c) => {
      let intervalDuration = parseDurationToHours(c.timeSpent || "02:00");
      if (intervalDuration === 0) intervalDuration = 2; // default interval

      const taskNames: string[] = [];
      if (c.tasks && c.tasks.length > 0) {
        c.tasks.forEach((t) => {
          taskNames.push(t.text);
          if (t.timeTaken) {
            const tHours = parseDurationToHours(t.timeTaken);
            if (tHours > 0) totalLoggedHours += tHours;
          }
        });
      } else if (c.completedTasks && c.completedTasks.length > 0) {
        taskNames.push(...c.completedTasks);
        totalLoggedHours += intervalDuration;
      } else {
        taskNames.push("Interval Check-in Logged");
        totalLoggedHours += intervalDuration;
      }

      timeline.push({
        interval: c.interval,
        tasks: taskNames,
        durationStr: `${intervalDuration}h`,
        durationMinutes: Math.round(intervalDuration * 60),
        source: "CHECKIN",
      });
    });

    // 2. Process EOD tasks with timings
    if (eod) {
      if (eod.tasksWithTimings && eod.tasksWithTimings.length > 0) {
        eod.tasksWithTimings.forEach((t) => {
          // If interval already exists in timeline, merge
          const existing = timeline.find((tl) => tl.interval === t.interval);
          if (existing) {
            if (!existing.tasks.includes(t.text)) existing.tasks.push(t.text);
          } else {
            const tHours = parseDurationToHours(t.timeTaken || "02:00");
            totalLoggedHours += tHours;
            timeline.push({
              interval: t.interval || "Final EOD Submission",
              tasks: [t.text],
              durationStr: t.timeTaken || "2h",
              durationMinutes: Math.round(tHours * 60),
              source: "EOD",
            });
          }
        });
      } else if (timeline.length === 0 && eod.completedItems && eod.completedItems.length > 0) {
        eod.completedItems.forEach((item) => {
          timeline.push({
            interval: "EOD Completed Task",
            tasks: [item],
            durationStr: "N/A",
            durationMinutes: 60,
            source: "EOD",
          });
        });
        if (eod.hoursWorked) totalLoggedHours = eod.hoursWorked;
      }
    }

    totalLoggedHours = +totalLoggedHours.toFixed(2);
    if (totalLoggedHours === 0 && eod?.hoursWorked) {
      totalLoggedHours = eod.hoursWorked;
    }

    // Expected check-ins based on shift duration (approx 1 checkin per 2 hours)
    const checkinInterval = u.checkinIntervalMinutes || 120;
    const expectedCheckinsCount = checkinInterval > 0 && shiftHours > 0
      ? Math.floor((shiftHours * 60) / checkinInterval)
      : 0;
    const checkinsCount = checkins.length;
    const missedCheckinCount = Math.max(0, expectedCheckinsCount - checkinsCount);

    const completedTasksCount = plannedItems.filter((i) => i.done).length +
      (timeline.flatMap((t) => t.tasks).length > 0 ? timeline.flatMap((t) => t.tasks).length : 0);

    const completionRate = plannedTasksCount > 0
      ? Math.min(100, Math.round((plannedItems.filter((i) => i.done).length / plannedTasksCount) * 100))
      : (eod ? 100 : 0);

    const timeAdherenceRate = shiftHours > 0
      ? Math.min(100, Math.round((totalLoggedHours / shiftHours) * 100))
      : (totalLoggedHours > 0 ? 100 : 0);

    const top3Tasks = eod?.top3Tasks && eod.top3Tasks.length > 0
      ? eod.top3Tasks
      : plannedItems.filter((i) => i.isTopTask).map((i) => i.text).slice(0, 3);

    const blockers = eod?.blockers || "";

    // Generate insights
    let insights = "";
    if (eod && completionRate >= 80 && timeAdherenceRate >= 80) {
      insights = `High daily efficiency: Completed ${completionRate}% of planned tasks with ${totalLoggedHours}h accounted across ${checkinsCount} check-in intervals.`;
    } else if (eod && missedCheckinCount > 1) {
      insights = `EOD submitted (${totalLoggedHours}h logged), but ${missedCheckinCount} check-in intervals were missed during active shift.`;
    } else if (!eod && todo) {
      insights = `Morning To-Do list created (${plannedTasksCount} tasks), but final EOD report is pending submission.`;
    } else if (!eod && !todo) {
      insights = `No daily To-Do or EOD submitted for this date.`;
    } else {
      insights = `Daily flow completed: ${completedTasksCount} tasks recorded with ${totalLoggedHours}h total duration.`;
    }

    return {
      employeeId: u.employeeId,
      name: u.name,
      department: (u as any).departmentName || null,
      date,
      loginTime,
      logoutTime,
      shiftHours,
      totalLoggedHours,
      timeAdherenceRate,
      plannedTasksCount,
      completedTasksCount,
      completionRate,
      checkinsCount,
      expectedCheckinsCount,
      missedCheckinCount,
      top3Tasks,
      blockers,
      timeline,
      eodSubmitted: !!eod,
      todoSubmitted: !!todo,
      insights,
    };
  });

  const totalEmployees = users.length;
  const todoSubmittedCount = employeeAnalyses.filter((e) => e.todoSubmitted).length;
  const eodSubmittedCount = employeeAnalyses.filter((e) => e.eodSubmitted).length;
  const avgCompletionRate = totalEmployees > 0
    ? Math.round(employeeAnalyses.reduce((acc, curr) => acc + curr.completionRate, 0) / totalEmployees)
    : 0;
  const avgLoggedHours = totalEmployees > 0
    ? +(employeeAnalyses.reduce((acc, curr) => acc + curr.totalLoggedHours, 0) / totalEmployees).toFixed(2)
    : 0;
  const avgTimeAdherence = totalEmployees > 0
    ? Math.round(employeeAnalyses.reduce((acc, curr) => acc + curr.timeAdherenceRate, 0) / totalEmployees)
    : 0;
  const totalMissedCheckins = employeeAnalyses.reduce((acc, curr) => acc + curr.missedCheckinCount, 0);

  const teamHighlights: string[] = [];
  teamHighlights.push(`${eodSubmittedCount}/${totalEmployees} employees submitted their End-Of-Day report.`);
  teamHighlights.push(`Average task completion rate across active team members is ${avgCompletionRate}%.`);
  teamHighlights.push(`Average work time documented per employee is ${avgLoggedHours} hours.`);
  if (totalMissedCheckins > 0) {
    teamHighlights.push(`${totalMissedCheckins} interval check-ins were missed or delayed during work sessions.`);
  }

  const analysisReport: TeamDailyFlowAnalysis = {
    date,
    generatedAt: new Date().toISOString(),
    totalEmployees,
    todoSubmittedCount,
    eodSubmittedCount,
    avgCompletionRate,
    avgLoggedHours,
    avgTimeAdherence,
    totalMissedCheckins,
    employees: employeeAnalyses,
    teamHighlights,
  };

  analysisCache.set(date, analysisReport);
  return analysisReport;
}

// Scheduled Nightly Runner (8:00 PM – 12:00 AM)
export function startNightlyAnalysisScheduler() {
  console.log("🕒 Starting EOD & Daily Flow Analysis Nightly Scheduler (8 PM - 12 AM)");
  // Check every 30 minutes
  setInterval(async () => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      // Between 20:00 (8 PM) and 23:59 (Midnight)
      if (currentHour >= 20 && currentHour <= 23) {
        const today = now.toISOString().split("T")[0];
        console.log(`[EOD Analysis Engine] Running nightly analysis for ${today} at ${now.toLocaleTimeString()}`);
        await runDailyFlowAnalysisEngine(today);
      }
    } catch (err) {
      console.error("[EOD Analysis Engine] Nightly scheduler error:", err);
    }
  }, 30 * 60 * 1000);
}
