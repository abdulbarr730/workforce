/**
 * The realistic local dataset behind `pnpm seed:dev`.
 *
 * Expects an EMPTY, already connected database. Raw data (users, telemetry,
 * requests) is inserted directly; everything derived (attendance records,
 * daily analytics, devices, productivity scores) is produced by the real
 * services, exactly as it is in production.
 *
 * When you add or change a model, update this file (see docs/seed-data.md).
 */
import bcrypt from "bcrypt";
import mongoose from "mongoose";

import { UserRole } from "../../_shared/constants";
import { User } from "../../modules/users/model/user.model";
import { Department } from "../../modules/departments/model/department.model";
import { ShiftPolicy } from "../../modules/attendance/model/shift-policy.model";
import { Holiday } from "../../modules/attendance/model/holiday.model";
import { LeaveRequest } from "../../modules/attendance/model/leave-request.model";
import { AttendanceChangeRequest } from "../../modules/attendance/model/attendance-change-request.model";
import { AttendanceRecord } from "../../modules/attendance/model/attendance-record.model";
import { ActivityEvent } from "../../modules/tracking/model/activity-event.model";
import { WorkSession } from "../../modules/work-sessions/model/work-session.model";
import { DailyTodo } from "../../modules/daily-flow/model/daily-todo.model";
import { EodReport } from "../../modules/daily-flow/model/eod-report.model";
import { BreakSchedule } from "../../modules/daily-flow/model/break-schedule.model";
import { AssignedTask } from "../../modules/assigned-tasks/model/assigned-task.model";
import { Grievance } from "../../modules/grievances/model/grievance.model";
import { AdminNotification } from "../../modules/notifications/model/admin-notification.model";
import { EmailLog } from "../../modules/notifications/model/email-log.model";
import { AccessRole } from "../../modules/access/model/access-role.model";
import { AiUsageLog } from "../../modules/system/model/ai-usage-log.model";
import { estimateCostUsd } from "../../modules/system/services/ai-usage.service";
import { ProductivityRule } from "../../modules/productivity-rules/model/productivity-rule.model";
import { WelcomeCallCampaign } from "../../modules/welcome-calls/model/welcome-call-campaign.model";
import { WelcomeCallLead } from "../../modules/welcome-calls/model/welcome-call-lead.model";
import { DeviceError } from "../../modules/devices/model/device-error.model";
import { LeaveBlock } from "../../modules/attendance/model/leave-policy.model";
import {
  AttendanceMark,
  AttendanceMarkSettings,
  WorkLocation,
} from "../../modules/attendance/model/attendance-mark.model";
import {
  allocateLeave,
  getLeavePolicy,
  saveLeaveAllowance,
  saveLeavePolicy,
} from "../../modules/attendance/services/leave-policy.service";
import { seedDefaultShifts } from "../../modules/attendance/services/seed-default-shifts.service";
import { computeAttendanceFromEvents } from "../../modules/attendance/services/compute-attendance.service";
import { getBusinessDate } from "../../modules/attendance/services/shift-schedule.service";
import { generateDailyAnalytics } from "../../modules/analytics/services/generate-daily-analytics.service";
import { resolveProductivityRule } from "../../modules/productivity-rules/services/resolve-productivity-rule.service";
import { upsertDeviceFromEvent } from "../../modules/devices/services/upsert-device-from-event.service";

import {
  COMPANY_ID,
  TelemetryEvent,
  addDays,
  buildWorkdayEvents,
  clockPlus,
  createRng,
  istAt,
  weekdayOf,
} from "./builders";

/** Dev-only password shared by every seeded account. */
export const DEFAULT_SEED_PASSWORD = "Password@123";

type SeedOptions = {
  /** Business date treated as "today" (YYYY-MM-DD, IST). */
  today?: string;
  /** How many days of history, including today. */
  days?: number;
  password?: string;
  /** Wall clock used to cut off today's telemetry. */
  now?: Date;
  log?: (message: string) => void;
};

const DEPARTMENTS = [
  {
    code: "01",
    name: "Engineering",
    description: "Builds and runs the internal platforms.",
    responsibilities: ["Feature development", "Code review", "Production support"],
    primaryTools: ["Visual Studio Code", "Google Chrome", "Slack"],
    appWorkflows: [{ app: "Visual Studio Code", pairedApp: "Google Chrome", description: "Write code and test it in the browser." }],
    tasks: ["Fix attendance edge case", "Review pull requests", "Write unit tests", "Update API docs", "Pair on sprint story"],
  },
  {
    code: "02",
    name: "Sales",
    description: "Converts webinar registrations into customers.",
    responsibilities: ["Welcome calls", "Lead follow-up", "CRM hygiene"],
    primaryTools: ["Microsoft Excel", "Google Chrome", "Microsoft Teams"],
    appWorkflows: [{ app: "Microsoft Excel", pairedApp: "Google Chrome", description: "Work the lead sheet alongside the CRM." }],
    tasks: ["Call new registrations", "Update lead sheet", "Follow up callbacks", "Prepare weekly pipeline", "Demo for prospect"],
  },
  {
    code: "03",
    name: "Operations",
    description: "Keeps HR, finance and support running.",
    responsibilities: ["Onboarding", "Vendor payments", "Support tickets"],
    primaryTools: ["Microsoft Excel", "Microsoft Teams", "Google Chrome"],
    appWorkflows: [{ app: "Microsoft Teams", pairedApp: "Microsoft Excel", description: "Coordinate requests and track them in sheets." }],
    tasks: ["Process vendor invoices", "Onboard new joiner", "Close support tickets", "Reconcile expenses", "Update SOP document"],
  },
] as const;

// [name, email local part] per department: first entry is the manager.
const PEOPLE: Record<string, Array<[string, string]>> = {
  "01": [["Arjun Mehta", "arjun"], ["Priya Nair", "priya"], ["Rohan Das", "rohan"], ["Sneha Iyer", "sneha"]],
  "02": [["Kavya Rao", "kavya"], ["Vikram Singh", "vikram"], ["Ananya Gupta", "ananya"], ["Farhan Ali", "farhan"]],
  "03": [["Meera Joshi", "meera"], ["Karan Patel", "karan"], ["Divya Menon", "divya"], ["Nikhil Bose", "nikhil"]],
};

const PRODUCTIVITY_RULES = [
  { appName: "Visual Studio Code", productivityCategory: "PRODUCTIVE", productivityScore: 1 },
  { appName: "Slack", productivityCategory: "PRODUCTIVE", productivityScore: 0.8 },
  { appName: "Microsoft Teams", productivityCategory: "PRODUCTIVE", productivityScore: 0.8 },
  { appName: "Microsoft Excel", productivityCategory: "PRODUCTIVE", productivityScore: 0.9 },
  { appName: "Google Chrome", productivityCategory: "NEUTRAL", productivityScore: 0.5 },
  { appName: "YouTube", productivityCategory: "UNPRODUCTIVE", productivityScore: 0.1 },
];

type SeedUser = {
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
};

export const seedDevDataset = async (options: SeedOptions = {}) => {
  const log = options.log ?? (() => undefined);
  const now = options.now ?? new Date();
  const today = options.today ?? getBusinessDate(now);
  const days = options.days ?? 14;
  const rng = createRng(20260930);
  const password = await bcrypt.hash(options.password ?? DEFAULT_SEED_PASSWORD, 10);
  const firstDay = addDays(today, -(days - 1));
  const dates = Array.from({ length: days }, (_, i) => addDays(firstDay, i));
  const pastWeekdays = dates.filter((d) => d < today && !["SATURDAY", "SUNDAY"].includes(weekdayOf(d)));

  // --- Shifts -------------------------------------------------------------
  log("shift policies");
  await seedDefaultShifts();
  const shifts = await ShiftPolicy.find({ isActive: true }).lean();
  const weekdayShift = shifts.find((s) => s.name === "WEEKDAY")!;
  const shiftFor = (date: string) =>
    shifts.find((s) => (s.activeDays as string[]).includes(weekdayOf(date))) ?? weekdayShift;

  // --- Departments and users ----------------------------------------------
  log("departments and users");
  const departments = await Department.insertMany(
    DEPARTMENTS.map(({ tasks: _tasks, ...dept }) => ({ ...dept, kbNotes: `${dept.name} seeded for local development.` })),
  );
  const deptByCode = new Map(departments.map((d) => [d.code as string, d]));

  const users: SeedUser[] = [
    { employeeId: "EMP001", name: "Super Admin", email: "superadmin@dev.local", role: UserRole.SUPER_ADMIN, departmentId: null, departmentName: null, departmentCode: null },
    { employeeId: "EMP002", name: "Aditi Admin", email: "admin@dev.local", role: UserRole.ADMIN, departmentId: null, departmentName: null, departmentCode: null },
    { employeeId: "EMP003", name: "Harsh HR", email: "hr@dev.local", role: UserRole.HR, departmentId: null, departmentName: null, departmentCode: null },
  ];
  for (const [code, people] of Object.entries(PEOPLE)) {
    const dept = deptByCode.get(code)!;
    people.forEach(([name, local], index) => {
      users.push({
        employeeId: `EMP_${code}_${String(index + 1).padStart(2, "0")}`,
        name,
        email: `${local}@dev.local`,
        role: index === 0 ? UserRole.MANAGER : UserRole.EMPLOYEE,
        departmentId: String(dept._id),
        departmentName: dept.name,
        departmentCode: code,
      });
    });
  }

  await User.insertMany(
    users.map(({ departmentCode: _code, ...user }) => ({
      ...user,
      password,
      departmentIds: user.departmentId ? [user.departmentId] : [],
      departmentNames: user.departmentName ? [user.departmentName] : [],
      assignedShiftPolicyId: String(weekdayShift._id),
      assignedShiftPolicyName: weekdayShift.name,
      isScreenshotTrackingEnabled: user.role === UserRole.EMPLOYEE,
    })),
  );
  for (const code of Object.keys(PEOPLE)) {
    const manager = users.find((u) => u.departmentCode === code && u.role === UserRole.MANAGER)!;
    await Department.updateOne({ code }, { $set: { managerId: manager.employeeId, managerName: manager.name } });
  }

  // Everyone except SUPER_ADMIN/ADMIN runs the agent and gets attendance
  // (same exclusion as src/scripts/recompute-day.ts).
  const tracked = users.filter((u) => u.role !== UserRole.SUPER_ADMIN && u.role !== UserRole.ADMIN);
  const byId = new Map(users.map((u) => [u.employeeId, u]));
  const admin = byId.get("EMP002")!;
  const managerOf = (u: SeedUser) =>
    users.find((m) => m.departmentCode === u.departmentCode && m.role === UserRole.MANAGER)!;

  // --- Calendar: holidays and leaves (inserted before attendance is derived) --
  log("holidays and leave requests");
  const pastHoliday = pastWeekdays[Math.max(0, pastWeekdays.length - 6)];
  await Holiday.insertMany([
    { name: "Company Foundation Day", date: pastHoliday, type: "COMPANY" },
    { name: "Festival Holiday", date: addDays(today, 10), type: "NATIONAL" },
    { name: "Quarter-end Offsite", date: addDays(today, 24), type: "COMPANY", paid: true },
  ]);

  const leaveDays = pastWeekdays.filter((d) => d !== pastHoliday);
  const fullLeave = { employeeId: "EMP_01_03", startDate: leaveDays[1], endDate: leaveDays[2] };
  const halfDayLeave = { employeeId: "EMP_02_03", date: leaveDays[leaveDays.length - 3] };
  const leaves = await LeaveRequest.insertMany([
    { ...fullLeave, type: "CASUAL", reason: "Family function", status: "APPROVED", approvedBy: admin.employeeId, adminReason: "Enjoy!" },
    { employeeId: halfDayLeave.employeeId, startDate: halfDayLeave.date, endDate: halfDayLeave.date, type: "HALF_DAY", reason: "Doctor appointment in the morning", status: "APPROVED", approvedBy: admin.employeeId },
    { employeeId: "EMP_01_02", startDate: addDays(today, 5), endDate: addDays(today, 6), type: "ANNUAL", reason: "Short trip", status: "PENDING" },
    { employeeId: "EMP_02_04", startDate: addDays(today, 1), endDate: addDays(today, 1), type: "SICK", reason: "Not feeling well", status: "PENDING" },
    { employeeId: "EMP_03_02", startDate: addDays(today, 3), endDate: addDays(today, 3), type: "CASUAL", reason: "Personal errand", status: "REJECTED", approvedBy: admin.employeeId, adminReason: "Month-end close that day" },
  ]);
  const onFullLeave = (employeeId: string, date: string) =>
    employeeId === fullLeave.employeeId && date >= fullLeave.startDate && date <= fullLeave.endDate;

  // --- Telemetry and work sessions ----------------------------------------
  log("telemetry (this takes a moment)");
  const forcedLate = { employeeId: "EMP_01_04", date: leaveDays[leaveDays.length - 1] };
  const allEvents: TelemetryEvent[] = [];
  const sessions: Array<Record<string, unknown>> = [];
  const workedDays: Array<{ user: SeedUser; date: string; login: Date; logout: Date | null }> = [];

  for (const user of tracked) {
    const deviceId = `DEV-${user.employeeId}`;
    for (const date of dates) {
      const weekday = weekdayOf(date);
      if (weekday === "SUNDAY" || date === pastHoliday || onFullLeave(user.employeeId, date)) continue;
      const shift = shiftFor(date);
      const roll = rng.next();
      const isForcedLate = user.employeeId === forcedLate.employeeId && date === forcedLate.date;
      const isHalfDayLeave = user.employeeId === halfDayLeave.employeeId && date === halfDayLeave.date;
      if (!isForcedLate && !isHalfDayLeave && roll < 0.05) continue; // absent

      // On time means before the shift's login cutoff (e.g. 09:55 for 10:00).
      let loginClock = clockPlus(shift.loginCutoffTime, rng.int(-20, -4));
      let logoutClock: string = clockPlus(shift.shiftEndTime, rng.int(0, 40));
      if (isHalfDayLeave) loginClock = "14:00";
      else if (isForcedLate || roll < 0.17) loginClock = clockPlus(shift.loginCutoffTime, rng.int(15, 70));
      else if (roll < 0.22) logoutClock = rng.pick(["14:00", "14:30"]);

      const plan = {
        employeeId: user.employeeId,
        deviceId,
        date,
        loginClock,
        logoutClock,
        breaks: loginClock < "13:00" && logoutClock > "14:30" ? [{ startClock: `13:${rng.pick(["20", "30", "40"])}`, minutes: rng.int(30, 50) }] : [],
        idle: rng.chance(0.3) && logoutClock > "16:30" ? [{ startClock: "16:00", minutes: rng.int(12, 25) }] : [],
        until: date === today ? now : undefined,
      };
      const events = buildWorkdayEvents(plan, rng);
      if (!events.length) continue;
      allEvents.push(...events);

      const login = istAt(date, loginClock);
      const logoutEvent = events.find((e) => e.type === "LOGOUT");
      const logout = logoutEvent ? logoutEvent.timestamp : null;
      workedDays.push({ user, date, login, logout });
      sessions.push({
        employeeId: user.employeeId,
        employeeName: user.name,
        departmentId: user.departmentId,
        departmentName: user.departmentName,
        loginAt: login,
        logoutAt: logout,
        status: logout ? "COMPLETED" : "ACTIVE",
        totalWorkedSeconds: logout ? Math.round((logout.getTime() - login.getTime()) / 1000) : 0,
      });
    }
  }

  // Productivity enrichment through the real rule resolver (as ingest does).
  await ProductivityRule.insertMany([
    ...PRODUCTIVITY_RULES.map((r) => ({ ...r, scopeType: "GLOBAL", createdBy: "EMP001", updatedBy: "EMP001" })),
    { scopeType: "DEPARTMENT", scopeId: String(deptByCode.get("02")!._id), appName: "Microsoft Excel", productivityCategory: "PRODUCTIVE", productivityScore: 1, createdBy: "EMP001", updatedBy: "EMP001" },
  ]);
  const ruleCache = new Map<string, Awaited<ReturnType<typeof resolveProductivityRule>>>();
  for (const event of allEvents) {
    const app = String(event.metadata.app || "UNKNOWN_APP");
    const key = `${event.employeeId}|${app}|${event.metadata.title || ""}`;
    if (!ruleCache.has(key)) {
      ruleCache.set(key, await resolveProductivityRule({ companyId: COMPANY_ID, employeeId: event.employeeId, appName: app, title: event.metadata.title as string | undefined }));
    }
    const rule = ruleCache.get(key)!;
    Object.assign(event, {
      productivityCategory: rule.productivityCategory,
      productivityScore: rule.productivityScore,
      matchedRuleId: (rule as any)._id ? String((rule as any)._id) : null,
    });
  }
  for (let i = 0; i < allEvents.length; i += 5000) {
    await ActivityEvent.insertMany(allEvents.slice(i, i + 5000), { ordered: false });
  }
  await WorkSession.insertMany(sessions);

  // Devices from each employee's latest event.
  for (const user of tracked) {
    const latest = [...allEvents].reverse().find((e) => e.employeeId === user.employeeId);
    if (latest) await upsertDeviceFromEvent({ ...latest, timestamp: latest.timestamp });
  }

  // --- Derived data through the real services -----------------------------
  log("attendance and analytics (derived by the real services)");
  process.env.SKIP_LOGIN_ANNOUNCE = "1";
  for (const date of dates) {
    for (const user of tracked) {
      await generateDailyAnalytics(COMPANY_ID, user.employeeId, date).catch(() => undefined);
      await computeAttendanceFromEvents({
        employeeId: user.employeeId,
        date,
        shiftPolicyId: String(weekdayShift._id),
      });
    }
  }

  // --- Daily flow: todos, check-ins, EOD reports ---------------------------
  log("todos and EOD reports");
  const todos: Array<Record<string, unknown>> = [];
  const eods: Array<Record<string, unknown>> = [];
  for (const { user, date, login, logout } of workedDays) {
    // HR has no department; give them the Operations task pool.
    const pool = (DEPARTMENTS.find((d) => d.code === user.departmentCode) ?? DEPARTMENTS[2]).tasks;
    const count = rng.int(3, 5);
    const start = rng.int(0, pool.length - 1);
    const texts = Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]);
    const isPast = date < today;
    todos.push({
      employeeId: user.employeeId,
      date,
      items: texts.map((text, i) => ({
        text,
        estimatedTime: `${rng.int(1, 3)}h`,
        isTopTask: i === 0,
        done: isPast ? rng.chance(0.8) : i === 0,
        completedAt: isPast ? new Date(login.getTime() + (i + 1) * 90 * 60_000) : null,
      })),
      checkins: isPast
        ? [
            { interval: "10:00 AM - 12:00 PM", tasks: [{ text: texts[0], timeTaken: "1h 30m", isTopTask: true }], notes: "On track", timeSpent: "2h", submittedAt: istAt(date, "12:05") },
            { interval: "12:00 PM - 2:00 PM", tasks: [{ text: texts[1], timeTaken: "1h" }], notes: "", timeSpent: "2h", submittedAt: istAt(date, "14:05") },
          ]
        : [],
    });
    if (isPast && logout && rng.chance(0.85)) {
      const done = texts.slice(0, Math.max(1, count - 1));
      eods.push({
        employeeId: user.employeeId,
        date,
        summary: `Worked on ${done.join(", ").toLowerCase()}.`,
        completedItems: done,
        tasksWithTimings: done.map((text, i) => ({ text, timeTaken: `${rng.int(1, 3)}h`, isTopTask: i === 0 })),
        top3Tasks: done.slice(0, 3),
        blockers: rng.chance(0.2) ? "Waiting on access to the staging server." : "",
        hoursWorked: Math.round(((logout.getTime() - login.getTime()) / 3_600_000) * 10) / 10,
        submittedAt: logout,
      });
    }
  }
  await DailyTodo.insertMany(todos);
  await EodReport.insertMany(eods);

  await BreakSchedule.insertMany(
    tracked.map((u) => ({
      employeeId: u.employeeId,
      employeeName: u.name,
      startTime: "13:30",
      durationMinutes: 45,
      fullDayAllowanceMinutes: 45,
      halfDayAllowanceMinutes: 20,
      templateName: "Lunch",
      message: "Time for lunch!",
      reasonOptions: ["Lunch", "Personal"],
      activeDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
      createdBy: admin.employeeId,
    })),
  );

  // --- Requests, tasks, grievances, notifications -------------------------
  log("requests, tasks, grievances and notifications");
  const lateUser = byId.get(forcedLate.employeeId)!;
  const lateRecord = await AttendanceRecord.findOne({ employeeId: lateUser.employeeId, date: forcedLate.date }).lean();
  const changeRequest = await AttendanceChangeRequest.create({
    employeeId: lateUser.employeeId,
    employeeName: lateUser.name,
    date: forcedLate.date,
    requestedLoginTime: istAt(forcedLate.date, "10:00"),
    reason: "Agent started late after a Windows update; I was at my desk at 10.",
    before: {
      attendanceStatus: lateRecord?.attendanceStatus ?? null,
      loginTime: lateRecord?.loginTime ?? null,
      logoutTime: lateRecord?.logoutTime ?? null,
    },
    history: [{ at: now, byEmployeeId: lateUser.employeeId, byName: lateUser.name, byRole: "EMPLOYEE", action: "CREATED", toStatus: "PENDING" }],
  });

  const pendingLeave = leaves.find((l) => l.status === "PENDING")!;
  const pendingLeaveUser = byId.get(pendingLeave.employeeId)!;
  await AdminNotification.insertMany([
    {
      kind: "LEAVE_REQUESTED",
      title: "New leave request",
      message: `${pendingLeaveUser.name} requested ${pendingLeave.type} leave ${pendingLeave.startDate} to ${pendingLeave.endDate}.`,
      employeeId: pendingLeaveUser.employeeId,
      employeeName: pendingLeaveUser.name,
      entityType: "LEAVE",
      entityId: String(pendingLeave._id),
      entityDate: pendingLeave.startDate,
      deepLink: `/dashboard/leaves?leaveId=${pendingLeave._id}`,
      changedBy: { employeeId: pendingLeaveUser.employeeId, name: pendingLeaveUser.name, role: "EMPLOYEE" },
    },
    {
      kind: "ATTENDANCE_CHANGE_REQUESTED",
      title: "Attendance correction requested",
      message: `${lateUser.name} asked to change login on ${forcedLate.date} to 10:00.`,
      employeeId: lateUser.employeeId,
      employeeName: lateUser.name,
      entityType: "ATTENDANCE",
      entityId: String(changeRequest._id),
      entityDate: forcedLate.date,
      deepLink: `/dashboard/requests?tab=attendance&id=${changeRequest._id}`,
      changedBy: { employeeId: lateUser.employeeId, name: lateUser.name, role: "EMPLOYEE" },
    },
  ]);

  const taskStatuses = ["REQUESTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
  const employees = tracked.filter((u) => u.role === UserRole.EMPLOYEE);
  await AssignedTask.insertMany(
    employees.slice(0, 7).map((employee, i) => {
      const manager = managerOf(employee);
      const status = taskStatuses[i % taskStatuses.length];
      const scheduledFor = addDays(today, i - 3);
      return {
        title: DEPARTMENTS.find((d) => d.code === employee.departmentCode)!.tasks[i % 5],
        description: "Seeded task for local development.",
        priority: (["LOW", "NORMAL", "HIGH", "URGENT"] as const)[i % 4],
        status,
        assignedByEmployeeId: manager.employeeId,
        assignedByName: manager.name,
        assignedToEmployeeId: employee.employeeId,
        assignedToName: employee.name,
        assignedToDepartmentName: employee.departmentName,
        scheduledFor,
        deadlineAt: istAt(addDays(scheduledFor, 2), "18:00"),
        estimatedTime: "2h",
        todoDate: scheduledFor,
        completedAt: status === "COMPLETED" ? istAt(scheduledFor, "17:00") : null,
        comments: [{ byEmployeeId: manager.employeeId, byName: manager.name, message: "Ping me if blocked." }],
      };
    }),
  );

  await Grievance.insertMany([
    { employeeId: "EMP_01_02", title: "Laptop overheating", description: "The laptop shuts down under load in the afternoons." },
    { employeeId: "EMP_03_03", title: "Payslip mismatch", description: "Overtime from last month is missing.", status: "RESOLVED", resolvedBy: "EMP003", resolvedAt: now, resolutionNote: "Corrected in the next payroll run." },
  ]);

  await DeviceError.insertMany([
    { deviceId: "DEV-EMP_02_02", employeeId: "EMP_02_02", errorType: "UPLOAD_FAILED", errorMessage: "Connection to backend timed out" },
    { deviceId: "DEV-EMP_03_04", employeeId: "EMP_03_04", errorType: "SCREENSHOT_FAILED", errorMessage: "Screen capture permission denied" },
  ]);

  // --- Welcome calls -------------------------------------------------------
  log("welcome-call campaign and leads");
  const salesManager = byId.get("EMP_02_01")!;
  const salesTeam = tracked.filter((u) => u.departmentCode === "02");
  const campaign = await WelcomeCallCampaign.create({
    key: "weekly-webinar-99",
    name: "Weekly Webinar (Rs 99)",
    registrationAmount: 99,
    webinarTitle: "Weekly Growth Webinar",
    effectiveFrom: firstDay,
    responsiblePeople: [{ employeeId: salesManager.employeeId, employeeName: salesManager.name }],
    memberRules: salesTeam.map((u) => ({
      employeeId: u.employeeId,
      employeeName: u.name,
      departmentId: u.departmentId,
      departmentName: u.departmentName,
    })),
    createdByEmployeeId: admin.employeeId,
    updatedByEmployeeId: admin.employeeId,
    updatedByName: admin.name,
  });
  const outcomes = ["CONNECTED", "NOT_CONNECTED", "CALLBACK", "WRONG_NUMBER"] as const;
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  const nextSunday = addDays(today, (7 - dayOfWeek) % 7 || 7);
  await WelcomeCallLead.insertMany(
    Array.from({ length: 20 }, (_, i) => {
      const registeredAt = new Date(now.getTime() - rng.int(1, 6 * 24) * 3_600_000);
      const assignee = i < 14 ? salesTeam[i % salesTeam.length] : null;
      const outcome = assignee && i % 3 !== 0 ? outcomes[i % outcomes.length] : null;
      return {
        campaignId: campaign._id,
        externalRegistrationId: `REG-${1000 + i}`,
        registrantName: `Registrant ${i + 1}`,
        phone: `+91 90000 ${String(10000 + i).slice(-5)}`,
        email: `registrant${i + 1}@example.com`,
        registeredAt,
        webinarDate: nextSunday,
        amount: 99,
        status: !assignee ? "UNASSIGNED" : outcome ?? "PENDING",
        lastOutcome: outcome,
        assignedToEmployeeId: assignee?.employeeId ?? null,
        assignedToEmployeeName: assignee?.name ?? null,
        assignedAt: assignee ? registeredAt : null,
        dueDate: assignee ? today : null,
        attemptCount: outcome ? 1 : 0,
        assignmentHistory: assignee ? [{ employeeId: assignee.employeeId, employeeName: assignee.name, assignedAt: registeredAt }] : [],
        callAttempts: outcome && assignee ? [{ employeeId: assignee.employeeId, employeeName: assignee.name, outcome, calledAt: now, notes: "Seeded call" }] : [],
      };
    }),
  );

  // --- Leave policy, balances and blocked days (through the real service) --
  log("leave policy and balances");
  const actor = { employeeId: admin.employeeId, name: admin.name };
  const defaultPolicy = await getLeavePolicy();
  await saveLeavePolicy(
    {
      types: defaultPolicy.types.map((t) =>
        t.code === "SICK" ? { ...t, yearlyLimit: 6 } : t.code === "CASUAL" ? { ...t, monthlyLimit: 1 } : t,
      ),
      totalMonthlyLimit: 1.5,
      totalYearlyLimit: 4,
      floatingOnTop: true,
      rolloverEnabled: true,
    },
    actor,
  );
  await saveLeaveAllowance(
    "EMP_02_02",
    { totalMonthlyLimit: 2, opening: { asOfMonth: today.slice(0, 7), monthlyCarried: 2, floatingLeft: 3 } },
    actor,
  );
  await LeaveBlock.create({
    startDate: addDays(today, 20),
    endDate: addDays(today, 21),
    scope: "ALL",
    reason: "Quarter-end close: no leave",
    createdBy: admin.employeeId,
    createdByName: admin.name,
  });
  // Stored monthly balances (LeaveBalanceSnapshot) are derived, as the job does.
  for (const user of tracked) await allocateLeave(user.employeeId, today.slice(0, 4));

  // --- Mark Attendance: configured but OFF, so attendance above is unchanged --
  log("work locations and attendance marks");
  await AttendanceMarkSettings.create({ key: "default", markRequired: false, locationRequired: false, updatedBy: admin.employeeId, updatedByName: admin.name });
  const office = await WorkLocation.create({
    name: "Head Office",
    latitude: 28.6139,
    longitude: 77.209,
    radiusMeters: 200,
    wifiNames: ["ProSync-Office"],
    publicIps: ["203.0.113.10"],
    createdByName: admin.name,
  });
  const todaysWork = workedDays.filter((d) => d.date === today);
  await AttendanceMark.insertMany(
    todaysWork.map(({ user, login }, i) => {
      const remote = i === todaysWork.length - 1;
      return {
        employeeId: user.employeeId,
        employeeName: user.name,
        date: today,
        laptopOpenAt: new Date(login.getTime() - 5 * 60_000),
        markedAt: login,
        loginTime: login,
        status: remote ? "PENDING_APPROVAL" : "MARKED",
        locationName: remote ? null : office.name,
        method: remote ? "REMOTE" : "WIFI",
        locationReachedAt: remote ? null : login,
        remoteReason: remote ? "Working from home: internet technician visit" : null,
        remoteRequestedAt: remote ? login : null,
        checks: [{ at: login, wifiName: remote ? "Home-WiFi" : "ProSync-Office", matched: !remote, locationName: remote ? null : office.name, method: "WIFI" }],
      };
    }),
  );

  // Roles: a limited admin-portal role and a switched-off one.
  await AccessRole.insertMany([
    {
      key: "CEO",
      name: "CEO",
      description: "Sees reports and attendance; approves requests.",
      baseRole: "ADMIN",
      adminPortal: true,
      fullAccess: false,
      permissions: ["overview.view", "attendance.view", "requests.view", "requests.decide", "daily-reports.view", "analytics.view", "reports.view", "admin-controls.view"],
    },
    {
      key: "OPERATIONS",
      name: "Operations",
      description: "Old role, kept for history.",
      baseRole: "HR",
      adminPortal: false,
      isActive: false,
    },
  ]);

  // AI usage over the last days (the real requests record themselves).
  const aiFeatures = ["eod-suggestion", "workforce-brain", "app-classifier", "employee-audit"];
  await AiUsageLog.insertMany(
    Array.from({ length: 12 }, (_, i) => {
      const inputTokens = 1500 + i * 220;
      const outputTokens = 300 + i * 40;
      const model = "claude-sonnet-4-5";
      return {
        feature: aiFeatures[i % aiFeatures.length],
        model,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(model, inputTokens, outputTokens),
        createdAt: new Date(Date.now() - (i % 7) * 24 * 60 * 60 * 1000),
      };
    }),
  );

  // Email log: what would have been sent (ZeptoMail is never set up locally).
  const emailed = users.filter((u) => u.role === UserRole.EMPLOYEE).slice(0, 3);
  await EmailLog.insertMany([
    ...emailed.map((u) => ({
      to: u.email,
      toName: u.name,
      employeeId: u.employeeId,
      subject: "Your Workforce login details",
      category: "WELCOME",
      status: "SENT",
      sentByEmployeeId: admin.employeeId,
      sentByName: admin.name,
    })),
    {
      to: emailed[0].email,
      toName: emailed[0].name,
      employeeId: emailed[0].employeeId,
      subject: "Your leave request was approved",
      category: "LEAVE_DECIDED",
      status: "FAILED",
      error: "HTTP 401: invalid token (seed example)",
      sentByEmployeeId: admin.employeeId,
      sentByName: admin.name,
    },
  ]);

  return {
    today,
    firstDay,
    password: options.password ?? DEFAULT_SEED_PASSWORD,
    users: users.map(({ employeeId, name, email, role, departmentName }) => ({ employeeId, name, email, role, departmentName })),
  };
};

/** Document counts for every registered model (used for the summary and tests). */
export const collectionCounts = async () => {
  const counts: Record<string, number> = {};
  for (const name of mongoose.modelNames().sort()) {
    counts[name] = await mongoose.model(name).countDocuments();
  }
  return counts;
};
