import { Request, Response } from "express";

import { generateDailyAttendance } from "../services/generate-daily-attendance.service";
import { MicroCache } from "../../../shared/utils/micro-cache";

// Regenerating attendance recomputes every employee from raw telemetry. The
// admin home used to trigger it every 30s per open tab; repeat requests for the
// same date within this window reuse the last run (or join the one in flight).
const REGENERATE_THROTTLE_MS = 2 * 60 * 1000;
const generateCache = new MicroCache<
  Awaited<ReturnType<typeof generateDailyAttendance>>
>(REGENERATE_THROTTLE_MS, 60);

export async function generateDailyAttendanceController(
  req: Request,
  res: Response,
) {
  const { date, force } = req.body;

  const result = await generateCache.getOrCompute(
    String(date),
    () => generateDailyAttendance({ date }),
    { fresh: force === true },
  );

  return res.status(200).json({
    success: true,
    message: "Attendance generated successfully",
    data: result,
  });
}
