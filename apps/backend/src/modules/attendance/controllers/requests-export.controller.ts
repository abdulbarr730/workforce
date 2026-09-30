import { Response } from "express";
import exceljs from "exceljs";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AppError } from "../../../shared/utils/app-error";
import { LeaveRequest } from "../model/leave-request.model";
import { AttendanceChangeRequest } from "../model/attendance-change-request.model";
import { User } from "../../users/model/user.model";
import { datesBetween, toDateKey } from "../services/request-rules.service";
import { paidSplitFor } from "../services/leave-policy.service";
import { getSuperAdmins, withoutSuperAdmin } from "../../../shared/utils/super-admin";

const indiaDateTime = (value?: Date | string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const indiaTime = (value?: Date | string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const styleHeader = (sheet: exceljs.Worksheet) => {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
};

const STATUS_FILL: Record<string, string> = {
  APPROVED: "FFDCFCE7",
  REJECTED: "FFFEE2E2",
  CANCELLED: "FFF1F5F9",
  PENDING: "FFFEF3C7",
};

/**
 * Admin: every leave / half-day request and attendance correction touching a
 * month, with its status and who decided it, as an Excel workbook.
 *   GET /attendance/requests/export?month=YYYY-MM
 */
export const exportRequestsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const month = String(req.query.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError("Choose a month (YYYY-MM).", 400);
    }
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31~`;

    const admins = await getSuperAdmins();
    const [rawLeaves, rawChanges] = await Promise.all([
      LeaveRequest.find({
        startDate: { $lte: monthEnd },
        endDate: { $gte: monthStart },
      })
        .sort({ startDate: 1, employeeId: 1 })
        .lean(),
      AttendanceChangeRequest.find({
        date: { $gte: monthStart, $lte: monthEnd },
      })
        .sort({ date: 1, employeeId: 1 })
        .lean(),
    ]);

    // Super Admin (developer) actions are left out of the export.
    const leaves = (rawLeaves as any[]).map((l) => withoutSuperAdmin(admins, l));
    const changes = (rawChanges as any[]).map((c) => withoutSuperAdmin(admins, c));
    const split = await paidSplitFor(
      (leaves as any[]).filter((l) => ["APPROVED", "PENDING"].includes(l.status)),
    );
    const employeeIds = Array.from(
      new Set([
        ...leaves.map((l: any) => l.employeeId),
        ...changes.map((c: any) => c.employeeId),
      ]),
    );
    const users = await User.find({ employeeId: { $in: employeeIds } })
      .select("employeeId name")
      .lean();
    const nameOf = new Map(
      users.map((u: any) => [String(u.employeeId), String(u.name)]),
    );
    const name = (row: any) =>
      row.employeeName || nameOf.get(row.employeeId) || row.employeeId;

    const workbook = new exceljs.Workbook();
    workbook.created = new Date();

    // ── Leave & half day ──────────────────────────────────────────────────
    const leaveSheet = workbook.addWorksheet("Leave & Half Day");
    leaveSheet.columns = [
      { header: "Employee ID", key: "employeeId", width: 16 },
      { header: "Employee", key: "employee", width: 24 },
      { header: "Type", key: "type", width: 14 },
      { header: "From", key: "from", width: 12 },
      { header: "To", key: "to", width: 12 },
      { header: "Days in month", key: "days", width: 13 },
      { header: "Paid days", key: "paid", width: 11 },
      { header: "From monthly leave", key: "monthly", width: 18 },
      { header: "From floating leave", key: "floating", width: 18 },
      { header: "Unpaid days", key: "unpaid", width: 12 },
      { header: "Reason", key: "reason", width: 40 },
      { header: "Status", key: "status", width: 12 },
      { header: "Decided by", key: "decidedBy", width: 20 },
      { header: "Decided at", key: "decidedAt", width: 20 },
      { header: "Admin note", key: "adminReason", width: 32 },
      { header: "Requested at", key: "requestedAt", width: 20 },
      { header: "History", key: "history", width: 60 },
    ];
    for (const leave of leaves as any[]) {
      const start = toDateKey(leave.startDate);
      const end = toDateKey(leave.endDate) || start;
      const isHalf = String(leave.type).toUpperCase() === "HALF_DAY";
      const daysInMonth = datesBetween(start, end).filter((d) =>
        d.startsWith(month),
      ).length;
      const decided = (leave.history || [])
        .filter((h: any) => ["APPROVED", "REJECTED"].includes(h.action))
        .pop();
      const row = leaveSheet.addRow({
        employeeId: leave.employeeId,
        employee: name(leave),
        type: isHalf ? "Half day" : leave.type,
        from: start,
        to: end,
        days: isHalf ? 0.5 : daysInMonth,
        paid: split.get(String(leave._id))?.paid ?? "",
        monthly: split.get(String(leave._id))?.monthly ?? "",
        floating: split.get(String(leave._id))?.floating ?? "",
        unpaid: split.get(String(leave._id))?.unpaid ?? "",
        reason: leave.reason,
        status: leave.status,
        decidedBy: leave.decidedByName || decided?.byName || leave.approvedBy || "",
        decidedAt: indiaDateTime(leave.decidedAt || decided?.at),
        adminReason: leave.adminReason || "",
        requestedAt: indiaDateTime(leave.createdAt),
        history: (leave.history || [])
          .map(
            (h: any) =>
              `${indiaDateTime(h.at)} ${h.action}${h.byName ? ` by ${h.byName}` : ""}${h.note ? `: ${h.note}` : ""}`,
          )
          .join(" | "),
      });
      const fill = STATUS_FILL[leave.status];
      if (fill) {
        row.getCell("status").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fill },
        };
      }
    }
    styleHeader(leaveSheet);

    // ── Attendance corrections ────────────────────────────────────────────
    const changeSheet = workbook.addWorksheet("Attendance Corrections");
    changeSheet.columns = [
      { header: "Employee ID", key: "employeeId", width: 16 },
      { header: "Employee", key: "employee", width: 24 },
      { header: "Date", key: "date", width: 12 },
      { header: "Recorded status", key: "beforeStatus", width: 15 },
      { header: "Recorded login", key: "beforeLogin", width: 14 },
      { header: "Recorded logout", key: "beforeLogout", width: 15 },
      { header: "Requested login", key: "login", width: 15 },
      { header: "Requested logout", key: "logout", width: 16 },
      { header: "Reason", key: "reason", width: 40 },
      { header: "Status", key: "status", width: 12 },
      { header: "Decided by", key: "decidedBy", width: 20 },
      { header: "Decided at", key: "decidedAt", width: 20 },
      { header: "Admin note", key: "note", width: 32 },
      { header: "Requested at", key: "requestedAt", width: 20 },
    ];
    for (const change of changes as any[]) {
      const row = changeSheet.addRow({
        employeeId: change.employeeId,
        employee: name(change),
        date: change.date,
        beforeStatus: change.before?.attendanceStatus || "",
        beforeLogin: indiaTime(change.before?.loginTime),
        beforeLogout: indiaTime(change.before?.logoutTime),
        login: indiaTime(change.requestedLoginTime),
        logout: indiaTime(change.requestedLogoutTime),
        reason: change.reason,
        status: change.status,
        decidedBy: change.decidedByName || "",
        decidedAt: indiaDateTime(change.decidedAt),
        note: change.decisionReason || "",
        requestedAt: indiaDateTime(change.createdAt),
      });
      const fill = STATUS_FILL[change.status];
      if (fill) {
        row.getCell("status").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fill },
        };
      }
    }
    styleHeader(changeSheet);

    // ── Summary per employee ──────────────────────────────────────────────
    const summary = workbook.addWorksheet("Summary");
    summary.columns = [
      { header: "Employee ID", key: "employeeId", width: 16 },
      { header: "Employee", key: "employee", width: 24 },
      { header: "Leave days approved", key: "approvedDays", width: 19 },
      { header: "Half days approved", key: "approvedHalf", width: 18 },
      { header: "Leaves rejected", key: "rejected", width: 15 },
      { header: "Leaves cancelled", key: "cancelled", width: 16 },
      { header: "Leaves pending", key: "pending", width: 15 },
      { header: "Unpaid days (approved)", key: "unpaidDays", width: 21 },
      { header: "Corrections approved", key: "fixApproved", width: 20 },
      { header: "Corrections rejected", key: "fixRejected", width: 20 },
    ];
    for (const employeeId of employeeIds.sort()) {
      const own = (leaves as any[]).filter((l) => l.employeeId === employeeId);
      const ownFixes = (changes as any[]).filter(
        (c) => c.employeeId === employeeId,
      );
      const isHalf = (l: any) => String(l.type).toUpperCase() === "HALF_DAY";
      const approvedDays = own
        .filter((l) => l.status === "APPROVED" && !isHalf(l))
        .reduce((sum, l) => {
          const start = toDateKey(l.startDate);
          const end = toDateKey(l.endDate) || start;
          return (
            sum + datesBetween(start, end).filter((d) => d.startsWith(month)).length
          );
        }, 0);
      summary.addRow({
        employeeId,
        employee: name(own[0] || ownFixes[0] || { employeeId }),
        approvedDays,
        approvedHalf: own.filter((l) => l.status === "APPROVED" && isHalf(l))
          .length,
        rejected: own.filter((l) => l.status === "REJECTED").length,
        cancelled: own.filter((l) => l.status === "CANCELLED").length,
        pending: own.filter((l) => l.status === "PENDING").length,
        unpaidDays: own
          .filter((l) => l.status === "APPROVED")
          .reduce((sum, l) => sum + (split.get(String(l._id))?.unpaid || 0), 0),
        fixApproved: ownFixes.filter((c) => c.status === "APPROVED").length,
        fixRejected: ownFixes.filter((c) => c.status === "REJECTED").length,
      });
    }
    styleHeader(summary);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=requests_${month}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  },
);
