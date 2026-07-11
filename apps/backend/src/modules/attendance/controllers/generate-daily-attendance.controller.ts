import { Request, Response } from "express";

import { generateDailyAttendance } from "../services/generate-daily-attendance.service";

export async function generateDailyAttendanceController(
  req: Request,
  res: Response,
) {
  const { date } = req.body;

  const result = await generateDailyAttendance({
    date,
  });

  return res.status(200).json({
    success: true,
    message: "Attendance generated successfully",
    data: result,
  });
}
