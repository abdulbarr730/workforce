import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { getTeamIntelligence } from "../services/get-team-intelligence.service";
import exceljs from "exceljs";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";

function autoFitColumns(worksheet: any) {
  worksheet.columns.forEach((column: any) => {
    let maxLength = 0;
    column.eachCell!({ includeEmpty: true }, (cell: any) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    // Set width with a minimum of 10 and a little padding
    column.width = Math.max(10, maxLength + 2);
  });
}

export const customReportController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      startDate,
      endDate,
      employeeId,
      includeAttendance,
      topProductiveLimit,
      topUnproductiveLimit,
      includeShifts,
      includeNeedsAttention,
    } = req.body;

    if (!startDate || !endDate) {
      res.status(400);
      res.send({ success: false, message: "startDate and endDate are required" });
      return;
    }

    // Get the base intelligence data
    const intel = await getTeamIntelligence(
      startDate,
      endDate,
      employeeId && employeeId !== "ALL" ? employeeId : undefined
    );

    const workbook = new exceljs.Workbook();
    workbook.creator = "ProSync Workforce Platform";
    workbook.created = new Date();

    // 1. Overview Sheet (always included as a summary)
    const overviewSheet = workbook.addWorksheet("Overview");
    overviewSheet.columns = [
      { header: "Metric", key: "metric" },
      { header: "Value", key: "value" },
    ];
    overviewSheet.addRow({ metric: "Date Range", value: `${startDate} to ${endDate}` });
    overviewSheet.addRow({ metric: "Total Productive Hours", value: (intel.overview.totalProdMins / 60).toFixed(2) });
    overviewSheet.addRow({ metric: "Total Unproductive Hours", value: (intel.overview.totalNonProdMins / 60).toFixed(2) });
    overviewSheet.addRow({ metric: "Total Overtime Hours", value: (intel.overview.totalOtMins / 60).toFixed(2) });
    overviewSheet.addRow({ metric: "Total EODs Submitted", value: intel.overview.totalEods });
    overviewSheet.addRow({ metric: "Total Todos Created", value: intel.overview.totalTodos });
    overviewSheet.getRow(1).font = { bold: true };
    autoFitColumns(overviewSheet);

    // 2. Attendance & Login/Logout Timings
    if (includeAttendance) {
      const attendanceSheet = workbook.addWorksheet("Attendance & Timings");
      attendanceSheet.columns = [
        { header: "Date", key: "date" },
        { header: "Employee Name", key: "name" },
        { header: "Status", key: "status" },
        { header: "Login Time", key: "login" },
        { header: "Logout Time", key: "logout" },
        { header: "Productive Hours", key: "prod" },
        { header: "Unproductive Hours", key: "unprod" },
        { header: "Break Hours", key: "break" },
        { header: "Offline Work Hours", key: "offline" },
      ];
      
      const query: any = { date: { $gte: startDate, $lte: endDate } };
      if (employeeId && employeeId !== "ALL") query.employeeId = employeeId;
      
      const records = await AttendanceRecord.find(query).sort({ date: 1 }).lean();
      
      for (const rec of records) {
        attendanceSheet.addRow({
          date: rec.date,
          name: rec.employeeName,
          status: rec.attendanceStatus,
          login: rec.loginTime ? new Date(rec.loginTime).toLocaleTimeString() : "N/A",
          logout: rec.logoutTime ? new Date(rec.logoutTime).toLocaleTimeString() : "N/A",
          prod: ((rec.productiveMinutes || 0) / 60).toFixed(2),
          unprod: (((rec.idleMinutes || 0) + (rec.breakMinutes || 0)) / 60).toFixed(2),
          break: ((rec.breakMinutes || 0) / 60).toFixed(2),
          offline: ((rec.awayWorkingMinutes || 0) / 60).toFixed(2),
        });
      }
      attendanceSheet.getRow(1).font = { bold: true };
      autoFitColumns(attendanceSheet);
    }

    // 3. Productive Apps
    if (topProductiveLimit && topProductiveLimit > 0) {
      const prodSheet = workbook.addWorksheet("Top Productive Apps");
      prodSheet.columns = [
        { header: "Application / URL", key: "app" },
        { header: "Total Hours", key: "hours" },
      ];
      const limit = parseInt(topProductiveLimit, 10);
      const apps = intel.topProductiveLinks.slice(0, limit);
      apps.forEach(a => prodSheet.addRow(a));
      prodSheet.getRow(1).font = { bold: true };
      autoFitColumns(prodSheet);
    }

    // 4. Unproductive Apps
    if (topUnproductiveLimit && topUnproductiveLimit > 0) {
      const unprodSheet = workbook.addWorksheet("Top Unproductive Apps");
      unprodSheet.columns = [
        { header: "Application / URL", key: "app" },
        { header: "Total Hours", key: "hours" },
      ];
      const limit = parseInt(topUnproductiveLimit, 10);
      const apps = intel.topUnproductiveLinks.slice(0, limit);
      apps.forEach(a => unprodSheet.addRow(a));
      unprodSheet.getRow(1).font = { bold: true };
      autoFitColumns(unprodSheet);
    }

    // 5. Shifts & Weekend Workers
    if (includeShifts) {
      const shiftsSheet = workbook.addWorksheet("Shifts & Weekend Activity");
      shiftsSheet.columns = [
        { header: "Date", key: "date" },
        { header: "Day of Week", key: "day" },
        { header: "Employee Name", key: "name" },
        { header: "Shift Assigned", key: "shift" },
        { header: "Productive Hours", key: "prod" },
      ];
      
      const query: any = { date: { $gte: startDate, $lte: endDate } };
      if (employeeId && employeeId !== "ALL") query.employeeId = employeeId;
      
      const records = await AttendanceRecord.find(query).sort({ date: 1 }).lean();
      
      for (const rec of records) {
        const d = new Date(rec.date);
        const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });
        // Optionally flag weekends if we wanted to only show weekends, but showing all shifts is better context
        // and users specifically asked about someone working Sunday.
        shiftsSheet.addRow({
          date: rec.date,
          day: dayOfWeek,
          name: rec.employeeName,
          shift: rec.shiftAssigned || "Default",
          prod: ((rec.productiveMinutes || 0) / 60).toFixed(2),
        });
      }
      shiftsSheet.getRow(1).font = { bold: true };
      autoFitColumns(shiftsSheet);
    }

    // 6. Needs Attention
    if (includeNeedsAttention) {
      const attentionSheet = workbook.addWorksheet("Needs Attention");
      attentionSheet.columns = [
        { header: "Employee Name", key: "name" },
        { header: "Unproductive Hours", key: "unprod" },
        { header: "Late Days", key: "late" },
        { header: "EODs Missed", key: "eods" },
      ];
      intel.needsAttention.forEach(emp => {
        attentionSheet.addRow({
          name: emp.name,
          unprod: emp.unproductiveHours,
          late: emp.lateDays,
          eods: emp.eodsMissed,
        });
      });
      attentionSheet.getRow(1).font = { bold: true };
      autoFitColumns(attentionSheet);
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=custom_report_${startDate}_to_${endDate}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  }
);
