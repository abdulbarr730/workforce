import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { User } from "../../users/model/user.model";
import { generateDailyAnalytics } from "../services/generate-daily-analytics.service";
import { computeAttendanceFromEvents } from "../../attendance/services/compute-attendance.service";

export const syncTeamIntelligenceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required"
      });
    }

    const user = (req as any).user;
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN" && user.role !== "HR") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const users = await User.find({ role: { $nin: ["SUPER_ADMIN"] } }).lean();
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Safety cap: don't loop more than 31 days to prevent timeout
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 31) {
      return res.status(400).json({ success: false, message: "Sync range cannot exceed 31 days" });
    }

    let syncedCount = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      
      for (const u of users) {
        if (!u.employeeId) continue;
        
        try {
          await generateDailyAnalytics(u.companyId, u.employeeId, dateStr);
          await computeAttendanceFromEvents({
            companyId: u.companyId,
            employeeId: u.employeeId,
            date: dateStr,
            employeeName: u.name,
            departmentId: u.departmentId?.toString()
          });
          syncedCount++;
        } catch (err) {
          console.error(`Sync error for ${u.employeeId} on ${dateStr}:`, err);
        }
      }
    }

    return res.json(successResponse({ syncedCount }, "Team intelligence synced successfully"));
  }
);
