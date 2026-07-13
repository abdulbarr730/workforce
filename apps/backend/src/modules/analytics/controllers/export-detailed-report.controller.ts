import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { getTeamIntelligence } from "../services/get-team-intelligence.service";

export const exportDetailedReportController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { employeeId, type, date, month, week } = req.query;

    const filter: any = {};
    if (employeeId && employeeId !== "ALL") filter.employeeId = employeeId;

    let startDate: Date;
    let endDate: Date;

    if (req.query.startDate && req.query.endDate) {
      startDate = new Date(`${req.query.startDate}T00:00:00Z`);
      endDate = new Date(`${req.query.endDate}T23:59:59Z`);
    } else if (date) {
      startDate = new Date(`${date}T00:00:00Z`);
      endDate = new Date(`${date}T23:59:59Z`);
    } else if (month) {
      startDate = new Date(`${month}-01T00:00:00Z`);
      endDate = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
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
      else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

      startDate = new Date(
        ISOweekStart.toISOString().split("T")[0] + "T00:00:00Z",
      );
      endDate = new Date(
        startDate.getTime() +
          6 * 24 * 60 * 60 * 1000 +
          23 * 60 * 60 * 1000 +
          59 * 60 * 1000 +
          59000,
      );
    } else {
      res.status(400);
      res.send("Must provide startDate/endDate, date, week, or month.");
      return;
    }

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    const { employeeList } = await getTeamIntelligence(
      startDateStr,
      endDateStr,
      employeeId !== "ALL" ? (employeeId as string) : undefined,
    );

    res.setHeader("Content-Type", "text/csv");
    const fileDate =
      date ||
      week ||
      month ||
      `${req.query.startDate}_to_${req.query.endDate}` ||
      "custom_range";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=team_intelligence_${fileDate}.csv`,
    );

    // Write CSV Header
    res.write(
      "Employee ID,Name,Total Productive Hours,Total Unproductive Hours,Late Days,Days Present,Shifts Completed,EODs Submitted,Todos Created,EODs Missed\n",
    );

    for (const emp of employeeList) {
      const prodHours = emp.productiveHours.toFixed(2);
      const unprodHours = emp.unproductiveHours.toFixed(2);

      const escapeCsv = (str: string) => `"${(str || "").replace(/"/g, '""')}"`;

      res.write(
        `${emp.employeeId},${escapeCsv(emp.name)},${prodHours},${unprodHours},${emp.lateDays},${emp.presentDays},${emp.shiftCompletedDays},${emp.eodsSubmitted},${emp.todosSubmitted},${emp.eodsMissed}\n`,
      );
    }

    res.end();
  },
);
