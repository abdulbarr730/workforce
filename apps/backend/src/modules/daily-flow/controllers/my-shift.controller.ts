import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";
import { Device } from "../../devices/model/device.model";

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

    const deviceId = req.headers["x-device-id"] as string | undefined;
    let idleTimeoutMinutes = 5;
    let forceLogout = false;

    if (deviceId) {
      const device = await Device.findOne({ deviceId });
      if (device) {
        if (!device.employeeId) {
          // Auto-claim unassigned device for the current user
          device.employeeId = employeeId;
          device.assignedAt = new Date();
          await device.save();
        } else if (device.employeeId !== employeeId) {
          forceLogout = true;
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
          shift: shift
            ? {
                id: String(shift._id),
                name: shift.name,
                shiftStartTime: shift.shiftStartTime,
                shiftEndTime: shift.shiftEndTime,
                activeDays: shift.activeDays ?? [],
                eodTriggerTime: shift.eodTriggerTime,
              }
            : null,
        },
        "My shift fetched",
      ),
    );
  },
);
