import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";

export const assignShiftController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const now = new Date();
    // Use IST timezone (or whatever local is) based on hour/min
    // For simplicity, we just use the system's local time if it's node. 
    // Usually we would use moment.tz, but we can do string parsing:
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;
    
    const hourStr = getPart("hour") || "00";
    const minStr = getPart("minute") || "00";
    const weekday = getPart("weekday") || "Mon";

    const hh = parseInt(hourStr, 10);
    const mm = parseInt(minStr, 10);
    const timeVal = hh * 60 + mm;

    let assignedShift = "";
    let isLate = false;

    if (timeVal >= (12 * 60 + 30)) {
      if (weekday === "Sat") {
        assignedShift = "Half Day (12:30 to 17:00)";
      } else {
        assignedShift = "Half Day (12:30 to 18:30)";
      }
      isLate = true;
    } else if (weekday === "Sat") {
      // Sat logic: > 9:25 => 10:00 to 17:30. Else => 09:30 to 17:00
      if (timeVal > (9 * 60 + 25)) {
        assignedShift = "10:00 to 17:30";
        isLate = timeVal > (10 * 60);
      } else {
        assignedShift = "09:30 to 17:00";
        isLate = false;
      }
    } else if (weekday === "Sun") {
      assignedShift = "Weekend (No Shift)";
    } else {
      // Mon-Fri: > 9:55 => 10:30 to 19:00. Else => 10:00 to 18:30
      if (timeVal > (9 * 60 + 55)) {
        assignedShift = "10:30 to 19:00";
        isLate = timeVal > (10 * 60 + 30);
      } else {
        assignedShift = "10:00 to 18:30";
        isLate = false;
      }
    }

    // You could save this to a DailyAttendance or User record here.
    // For now, we return it to the agent.
    
    res.json(
      successResponse(
        {
          shift: assignedShift,
          isLate,
          loginTime: `${hourStr}:${minStr}`,
          weekday
        },
        "Shift assigned successfully"
      )
    );
  }
);
