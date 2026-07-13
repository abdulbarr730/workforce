import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { Device } from "../model/device.model";
import { User } from "../../users/model/user.model";

export const assignDeviceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { employeeId } = req.body as { employeeId: string };

    if (!employeeId) throw new AppError("employeeId is required", 400);

    const user = await User.findOne({ employeeId });
    if (!user) throw new AppError(`Employee ${employeeId} not found`, 404);

    const device = await Device.findOneAndUpdate(
      { deviceId },
      { $set: { employeeId, assignedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!device) throw new AppError(`Device ${deviceId} not found`, 404);

    res.json(successResponse(device, "Device assigned"));
  },
);

export const unassignDeviceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const device = await Device.findOneAndUpdate(
      { deviceId },
      { $set: { employeeId: null, assignedAt: null } },
      { returnDocument: "after" },
    );
    if (!device) throw new AppError(`Device ${deviceId} not found`, 404);
    res.json(successResponse(device, "Device unassigned"));
  },
);
