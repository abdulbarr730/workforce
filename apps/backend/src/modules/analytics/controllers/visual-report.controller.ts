import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { getTeamIntelligence } from "../services/get-team-intelligence.service";
import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { AttendanceStatus } from "../../attendance/types/attendance-status.enum";
import { successResponse } from "../../../shared/utils/api-response";
import { User } from "../../users/model/user.model";

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
      employeeList: intel.employeeList,
      latecomers: intel.latecomers
    };

    if (includeAttendance) {
      const query: any = { date: { $gte: startDate, $lte: endDate } };
      if (employeeId && employeeId !== "ALL") query.employeeId = employeeId;
      
      const [records, users] = await Promise.all([
        AttendanceRecord.find(query).sort({ date: 1 }).lean(),
        User.find({}).lean()
      ]);
      const userMap = new Map(users.map(u => [u.employeeId, u.name]));
      
      // Calculate Average Login/Logout Times grouped by Employee
      const employeeMap: Record<string, any> = {};

      records.forEach(rec => {
        if (!employeeMap[rec.employeeId]) {
          employeeMap[rec.employeeId] = {
            employeeId: rec.employeeId,
            name: rec.employeeName || userMap.get(rec.employeeId) || rec.employeeId,
            totalDays: 0,
            presentDays: 0,
            absentDays: 0,
            lateDays: 0,
            totalProductiveMins: 0,
            totalLoginMins: 0, // for average
            loginCount: 0,
            totalLogoutMins: 0, // for average
            logoutCount: 0
          };
        }
        const emp = employeeMap[rec.employeeId];
        emp.totalDays++;
        if (rec.attendanceStatus === AttendanceStatus.PRESENT) emp.presentDays++;
        else if (rec.attendanceStatus === AttendanceStatus.ABSENT) emp.absentDays++;
        
        if (rec.lateMinutes && rec.lateMinutes > 0) emp.lateDays++;

        emp.totalProductiveMins += (rec.productiveMinutes || 0);

        // Convert to IST (UTC + 5 hours 30 mins = 330 mins)
        if (rec.loginTime) {
          const d = new Date(rec.loginTime);
          if (!isNaN(d.getTime())) {
            const istTime = new Date(d.getTime() + 330 * 60000);
            emp.totalLoginMins += (istTime.getUTCHours() * 60 + istTime.getUTCMinutes());
            emp.loginCount++;
          }
        }
        if (rec.logoutTime) {
          const d = new Date(rec.logoutTime);
          if (!isNaN(d.getTime())) {
            const istTime = new Date(d.getTime() + 330 * 60000);
            emp.totalLogoutMins += (istTime.getUTCHours() * 60 + istTime.getUTCMinutes());
            emp.logoutCount++;
          }
        }
      });

      const formatTime = (totalMins: number, count: number) => {
        if (count === 0) return "N/A";
        const avgMins = Math.round(totalMins / count);
        const hours = Math.floor(avgMins / 60);
        const mins = avgMins % 60;
        const period = hours >= 12 ? 'PM' : 'AM';
        const h12 = hours % 12 || 12;
        return `${h12.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${period}`;
      };

      reportData.detailedAttendance = Object.values(employeeMap).map((emp: any) => ({
        employeeId: emp.employeeId,
        name: emp.name,
        totalDays: emp.totalDays,
        presentDays: emp.presentDays,
        absentDays: emp.absentDays,
        lateDays: emp.lateDays,
        avgProductiveHours: emp.presentDays > 0 ? (emp.totalProductiveMins / 60 / emp.presentDays).toFixed(2) : "0.00",
        avgLoginTime: formatTime(emp.totalLoginMins, emp.loginCount),
        avgLogoutTime: formatTime(emp.totalLogoutMins, emp.logoutCount)
      }));

      // Keep raw array for backward compatibility if needed, but the UI will use detailedAttendance
      reportData.attendance = records.map(rec => ({
        date: rec.date,
        name: rec.employeeName || userMap.get(rec.employeeId) || rec.employeeId,
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
      
      const [records, users] = await Promise.all([
        AttendanceRecord.find(query).sort({ date: 1 }).lean(),
        User.find({}).lean()
      ]);
      const userMap = new Map(users.map(u => [u.employeeId, u.name]));
      
      reportData.shifts = records.map(rec => {
        const d = new Date(rec.date);
        return {
          date: rec.date,
          dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'long' }),
          name: rec.employeeName || userMap.get(rec.employeeId) || rec.employeeId,
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
