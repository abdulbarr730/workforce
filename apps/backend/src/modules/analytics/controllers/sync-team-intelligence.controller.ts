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
        message: "startDate and endDate are required",
      });
    }

    const user = (req as any).user;
    if (
      user.role !== "SUPER_ADMIN" &&
      user.role !== "ADMIN" &&
      user.role !== "HR" &&
      user.role !== "MANAGER"
    ) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const users = await User.find({
      role: { $ne: "SUPER_ADMIN" as any },
    }).lean();

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Safety cap: don't loop more than 31 days to prevent timeout
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 31) {
      return res
        .status(400)
        .json({ success: false, message: "Sync range cannot exceed 31 days" });
    }

    let syncedCount = 0;

    // Batch processing to speed up while avoiding connection pool exhaustion
    const promises: (() => Promise<void>)[] = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];

      for (const u of users) {
        if (!u.employeeId) continue;

        promises.push(async () => {
          try {
            await generateDailyAnalytics("default", u.employeeId, dateStr);
            await computeAttendanceFromEvents({
              employeeId: u.employeeId,
              date: dateStr,
              shiftPolicyId: u.assignedShiftPolicyId || "default",
            });
            syncedCount++;
          } catch (err) {
            console.error(`Sync error for ${u.employeeId} on ${dateStr}:`, err);
          }
        });
      }
    }

    // Run in chunks of 10
    const chunkSize = 10;
    for (let i = 0; i < promises.length; i += chunkSize) {
      const chunk = promises.slice(i, i + chunkSize);
      await Promise.all(chunk.map((fn) => fn()));
    }

    return res.json(
      successResponse({ syncedCount }, "Team intelligence synced successfully"),
    );
  },
);
