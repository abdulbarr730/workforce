import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/api-response";
import { Device } from "../model/device.model";

const normalizeIdleTimeoutMinutes = (value: unknown) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) {
    return null;
  }
  return Math.round(minutes);
};

export const updateDeviceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { hostname, idleTimeoutMinutes } = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json(errorResponse("Device not found"));
    }

    if (hostname !== undefined) {
      device.hostname = hostname;
    }

    if (idleTimeoutMinutes !== undefined) {
      const normalizedIdleTimeout =
        normalizeIdleTimeoutMinutes(idleTimeoutMinutes);
      if (normalizedIdleTimeout === null) {
        return res
          .status(400)
          .json(errorResponse("Idle timeout must be between 1 and 120 minutes"));
      }
      device.idleTimeoutMinutes = normalizedIdleTimeout;
    }

    await device.save();

    return res.json(successResponse(device, "Device updated successfully"));
  },
);
