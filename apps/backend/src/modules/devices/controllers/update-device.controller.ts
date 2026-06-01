import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse, errorResponse } from "../../../shared/utils/api-response";
import { Device } from "../model/device.model";

export const updateDeviceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { hostname } = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json(errorResponse("Device not found"));
    }

    if (hostname !== undefined) {
      device.hostname = hostname;
    }

    await device.save();

    return res.json(successResponse(device, "Device updated successfully"));
  }
);
