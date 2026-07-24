import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { getTeamIntelligence } from "../services/get-team-intelligence.service";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { successResponse } from "../../../shared/utils/api-response";

export const visualReportController = asyncHandler(
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

    const intel = await getTeamIntelligence(
      startDate,
      endDate,
      employeeId && employeeId !== "ALL" ? employeeId : undefined
    );

    const reportData: any = {
      overview: {
        dateRange: `${startDate} to ${endDate}`,
        totalProductiveHours: (intel.overview.totalProdMins / 60).toFixed(2),
        totalUnproductiveHours: (intel.overview.totalNonProdMins / 60).toFixed(2),
        totalOvertimeHours: (intel.overview.totalOtMins / 60).toFixed(2),
        totalEods: intel.overview.totalEods,
        totalTodos: intel.overview.totalTodos,
      },
    };

    if (includeAttendance) {
      const query: any = { date: { $gte: startDate, $lte: endDate } };
      if (employeeId && employeeId !== "ALL") query.employeeId = employeeId;
      
      const records = await AttendanceRecord.find(query).sort({ date: 1 }).lean();
      reportData.attendance = records.map(rec => ({
        date: rec.date,
        name: rec.employeeName,
        status: rec.attendanceStatus,
        login: rec.loginTime ? new Date(rec.loginTime).toISOString() : null,
        logout: rec.logoutTime ? new Date(rec.logoutTime).toISOString() : null,
        productiveMinutes: rec.productiveMinutes || 0,
        idleMinutes: rec.idleMinutes || 0,
        breakMinutes: rec.breakMinutes || 0,
        awayWorkingMinutes: rec.awayWorkingMinutes || 0,
      }));
    }

    if (topProductiveLimit && topProductiveLimit > 0) {
      const limit = parseInt(topProductiveLimit, 10);
      reportData.topProductiveApps = intel.topProductiveLinks.slice(0, limit);
    }

    if (topUnproductiveLimit && topUnproductiveLimit > 0) {
      const limit = parseInt(topUnproductiveLimit, 10);
      reportData.topUnproductiveApps = intel.topUnproductiveLinks.slice(0, limit);
    }

    if (includeShifts) {
      const query: any = { date: { $gte: startDate, $lte: endDate } };
      if (employeeId && employeeId !== "ALL") query.employeeId = employeeId;
      
      const records = await AttendanceRecord.find(query).sort({ date: 1 }).lean();
      reportData.shifts = records.map(rec => {
        const d = new Date(rec.date);
        return {
          date: rec.date,
          dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'long' }),
          name: rec.employeeName,
          shiftAssigned: rec.shiftAssigned || "Default",
          productiveMinutes: rec.productiveMinutes || 0,
        };
      });
    }

    if (includeNeedsAttention) {
      reportData.needsAttention = intel.needsAttention;
    }

    res.status(200).json(successResponse(reportData, "Visual report generated"));
  }
);
