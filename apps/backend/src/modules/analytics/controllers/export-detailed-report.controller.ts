import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { User } from "../../users/model/user.model";

export const exportDetailedReportController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { employeeId, type, date, month, week } = req.query;

    const filter: any = {};
    if (employeeId && employeeId !== "ALL") filter.employeeId = employeeId;

    let startDate: Date;
    let endDate: Date;

    if (date) {
      startDate = new Date(`${date}T00:00:00Z`);
      endDate = new Date(`${date}T23:59:59Z`);
    } else if (month) {
      startDate = new Date(`${month}-01T00:00:00Z`);
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
    } else if (week) {
      // e.g. "2026-W28"
      const [yearStr, weekStr] = (week as string).split("-W");
      const year = parseInt(yearStr, 10);
      const weekNum = parseInt(weekStr, 10);
      
      const simple = new Date(year, 0, 1 + (weekNum - 1) * 7);
      const dow = simple.getDay();
      const ISOweekStart = simple;
      if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
      else
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
      
      startDate = new Date(ISOweekStart.toISOString().split("T")[0] + "T00:00:00Z");
      endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59000);
    } else {
      res.status(400);
      res.send("Must provide date, week, or month.");
      return;
    }

    filter.timestamp = { $gte: startDate, $lte: endDate };

    // Fetch user mapping
    const users = await User.find({}).lean();
    const userMap: Record<string, string> = {};
    users.forEach(u => userMap[u.employeeId] = u.name);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=detailed_telemetry_${date || week || month}.csv`);

    // Write CSV Header
    res.write("Employee ID,Name,Date,Time,Event Type,App,Title,URL,Duration (Seconds),Productivity\n");

    const cursor = ActivityEvent.find(filter).sort({ timestamp: 1 }).cursor();

    for await (const doc of cursor) {
      const ts = new Date(doc.timestamp);
      const rowDate = ts.toISOString().split("T")[0];
      const rowTime = ts.toISOString().split("T")[1].replace("Z", "");
      
      const empName = userMap[doc.employeeId] || "Unknown";
      
      // Basic CSV escaping
      const escapeCsv = (str: string) => {
         if (!str) return "";
         const cleaned = str.replace(/"/g, '""');
         return `"${cleaned}"`;
      };

      const app = escapeCsv(doc.metadata?.app || "");
      const title = escapeCsv(doc.metadata?.title || "");
      const url = escapeCsv(doc.metadata?.url || "");
      const duration = doc.metadata?.durationSeconds || 0;
      const prod = doc.productivityCategory || "UNTRACKED";
      
      res.write(`${doc.employeeId},"${empName}",${rowDate},${rowTime},${doc.type},${app},${title},${url},${duration},${prod}\n`);
    }

    res.end();
  }
);
