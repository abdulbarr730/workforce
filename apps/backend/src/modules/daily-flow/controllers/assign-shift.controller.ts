import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";
import { Device } from "../../devices/model/device.model";
import { getBusinessDate } from "../utils/business-date";
import {
  getBusinessDayBounds,
  resolveEffectiveShiftSchedule,
} from "../../attendance/services/shift-schedule.service";

export const assignShiftController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const deviceId = req.headers["x-device-id"] as string | undefined;
    let forceLogout = false;
    let selfDestruct = false;
    let deviceAssignmentConflict = false;

    if (deviceId) {
      const device = await Device.findOne({ deviceId });
      if (device?.pendingAction === "SIGNOUT") {
        forceLogout = true;
        device.pendingAction = null;
        await device.save();
      } else if (device?.pendingAction === "UNINSTALL") {
        selfDestruct = true;
        await Device.findOneAndDelete({ deviceId });
      } else if (device?.employeeId && device.employeeId !== employeeId) {
        deviceAssignmentConflict = true;
      }
    }

    const businessDate = getBusinessDate();
    const { start: startOfDay, end: endOfDay } =
      getBusinessDayBounds(businessDate);

    let session = await WorkSession.findOne({
      employeeId,
      loginAt: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort({ loginAt: 1 })
      .lean();

    const user = await User.findOne({ employeeId }).lean();
    if (!user) throw new AppError("User not found", 404);

    if (!session) {
      session = (await WorkSession.create({
        employeeId: user.employeeId,
        employeeName: (user as any).name,
        departmentId: (user as any).departmentId || null,
        departmentName: (user as any).departmentName || null,
        loginAt: new Date(),
        status: "ACTIVE",
      })) as any;
    }

    const exactLoginTime = session?.loginAt
      ? new Date(session.loginAt)
      : new Date();

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    const parts = formatter.formatToParts(exactLoginTime);
    const hourStr = parts.find((p) => p.type === "hour")?.value || "00";
    const minStr = parts.find((p) => p.type === "minute")?.value || "00";
    const weekday = parts.find((p) => p.type === "weekday")?.value || "Mon";

    const timeVal = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);

    // Determine active day in ShiftDay enum format
    const dayMap: Record<string, string> = {
      Sun: "SUNDAY",
      Mon: "MONDAY",
      Tue: "TUESDAY",
      Wed: "WEDNESDAY",
      Thu: "THURSDAY",
      Fri: "FRIDAY",
      Sat: "SATURDAY",
    };
    const activeDay = dayMap[weekday];

    // Priority 1: Check if the user has an explicitly assigned policy that is active TODAY
    let policy = null;
    if ((user as any).assignedShiftPolicyId) {
      policy = await ShiftPolicy.findOne({
        _id: (user as any).assignedShiftPolicyId,
        activeDays: { $in: [activeDay as any] },
        isActive: true,
      }).lean();
    }

    // Priority 2: Fallback to the default policy for TODAY
    if (!policy) {
      policy = await ShiftPolicy.findOne({
        activeDays: { $in: [activeDay as any] },
        isDefault: true,
        isActive: true,
      }).lean();

      // If no default exists for today, just find ANY active policy for today
      if (!policy) {
        policy = await ShiftPolicy.findOne({
          activeDays: { $in: [activeDay as any] },
          isActive: true,
        }).lean();
      }
    }

    let assignedShift = "No Shift Assigned";
    let shiftStartTime = "00:00";
    let shiftEndTime = "00:00";
    let isLate = false;
    let isHalfDay = false;

    if (policy) {
      const formatName = (name: string) =>
        name
          .split("_")
          .map(
            (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
          )
          .join(" ");
      assignedShift = formatName((policy as any).name || "Regular Shift");
      shiftStartTime = (policy as any).shiftStartTime || "00:00";
      shiftEndTime = (policy as any).shiftEndTime || "18:30";

      // Time Layer: Determine half day status based on policy's halfDayAfterTime
      if ((policy as any).shiftType === "HALF_DAY") {
        isHalfDay = true;
      } else if ((policy as any).halfDayAfterTime) {
        const [hh, mm] = ((policy as any).halfDayAfterTime as string).split(
          ":",
        );
        const hdMins = Number(hh) * 60 + Number(mm);
        if (timeVal >= hdMins) {
          isHalfDay = true;
        }
      }

      if (!isHalfDay) {
        const schedule = resolveEffectiveShiftSchedule(
          policy as any,
          exactLoginTime,
        );
        shiftStartTime = schedule.shiftStartTime;
        shiftEndTime = schedule.shiftEndTime;
        isLate = schedule.isLateEntry || (policy as any).shiftType === "LATE";
      }
    }

    res.json(
      successResponse(
        {
          shift: `${shiftStartTime} to ${shiftEndTime} (${assignedShift})`,
          shiftStartTime,
          shiftEndTime,
          isLate,
          isHalfDay,
          loginTime: `${hourStr}:${minStr}`,
          weekday,
          forceLogout,
          selfDestruct,
          deviceAssignmentConflict,
          checkinIntervalMinutes: (user as any).checkinIntervalMinutes ?? 120,
          customCheckinTimes: (user as any).customCheckinTimes ?? [],
        },
        "Shift assigned successfully",
      ),
    );
  },
);
