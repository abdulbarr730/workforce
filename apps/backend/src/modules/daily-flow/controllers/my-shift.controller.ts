import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";
import { Device } from "../../devices/model/device.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import { getBusinessDayBounds, getBusinessDate } from "../../attendance/services/shift-schedule.service";
import { resolveShiftVariant } from "../../attendance/services/resolve-shift-variant.service";

export const getMyShiftController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const user = await User.findOne({ employeeId }).lean();
    if (!user) throw new AppError("User not found", 404);

    let shift: any = null;
    if (user.assignedShiftPolicyId) {
      shift = await ShiftPolicy.findById(user.assignedShiftPolicyId).lean();
    }

    let resolvedShiftStartTime = shift?.shiftStartTime;
    let resolvedShiftEndTime = shift?.shiftEndTime;
    let resolvedShiftName = shift?.name;
    let resolvedEodTriggerTime = shift?.shiftEndTime || shift?.eodTriggerTime;

    if (shift?._id) {
      const businessDate = getBusinessDate();
      const { start: startOfDay, end: endOfDay } =
        getBusinessDayBounds(businessDate);
      const firstSession = await WorkSession.findOne({
        employeeId,
        loginAt: { $gte: startOfDay, $lte: endOfDay },
      })
        .sort({ loginAt: 1 })
        .lean();

      const resolution = await resolveShiftVariant({
        loginAt: firstSession?.loginAt ? new Date(firstSession.loginAt) : new Date(),
        shiftPolicyId: String(shift._id),
      });

      resolvedShiftStartTime = resolution.workedShiftStart;
      resolvedShiftEndTime = resolution.workedShiftEnd;
      resolvedEodTriggerTime = resolution.workedShiftEnd;
      resolvedShiftName = resolution.resolvedShiftPolicyName;
    }

    const deviceId = req.headers["x-device-id"] as string | undefined;
    let idleTimeoutMinutes = 10;
    let deviceAssignmentConflict = false;
    let forceLogout = false;
    let selfDestruct = false;

    if (deviceId) {
      const device = await Device.findOne({ deviceId });
      if (device) {
        if (device.pendingAction === "SIGNOUT") {
          forceLogout = true;
          device.pendingAction = null;
          await device.save();
        } else if (device.pendingAction === "UNINSTALL") {
          selfDestruct = true;
          await Device.findOneAndDelete({ deviceId });
        } else if (!device.employeeId) {
          // Auto-claim unassigned device for the current user
          device.employeeId = employeeId;
          device.assignedAt = new Date();
          await device.save();
        } else if (device.employeeId !== employeeId) {
          // A device inventory mismatch is not an authentication failure.
          deviceAssignmentConflict = true;
        } else if (device.idleTimeoutMinutes !== undefined) {
          idleTimeoutMinutes = device.idleTimeoutMinutes;
        }
      }
    }

    res.json(
      successResponse(
        {
          employeeId: user.employeeId,
          name: user.name,
          assignedShiftPolicyId: user.assignedShiftPolicyId,
          assignedShiftPolicyName: user.assignedShiftPolicyName,
          idleTimeoutMinutes,
          forceLogout,
          selfDestruct,
          deviceAssignmentConflict,
          checkinIntervalMinutes: (user as any).checkinIntervalMinutes ?? 120,
          customCheckinTimes: (user as any).customCheckinTimes ?? [],
          shift: shift
            ? {
                id: String(shift._id),
                name: resolvedShiftName,
                shiftStartTime: resolvedShiftStartTime,
                shiftEndTime: resolvedShiftEndTime,
                activeDays: shift.activeDays ?? [],
                eodTriggerTime: resolvedEodTriggerTime,
                eodTriggerSource: "SHIFT_END",
              }
            : null,
        },
        "My shift fetched",
      ),
    );
  },
);
