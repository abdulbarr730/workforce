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
    const deviceId = String(req.params.deviceId || "");
    const { hostname, idleTimeoutMinutes } = req.body;

    if (!deviceId || deviceId.startsWith("not-reported:")) {
      return res
        .status(400)
        .json(errorResponse("Cannot update a placeholder device"));
    }

    const set: Record<string, unknown> = { isActive: true };
    if (hostname !== undefined) {
      set.hostname = String(hostname || "").trim() || null;
    }

    if (idleTimeoutMinutes !== undefined) {
      const normalizedIdleTimeout =
        normalizeIdleTimeoutMinutes(idleTimeoutMinutes);
      if (normalizedIdleTimeout === null) {
        return res
          .status(400)
          .json(errorResponse("Idle timeout must be between 1 and 120 minutes"));
      }
      set.idleTimeoutMinutes = normalizedIdleTimeout;
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: set,
        $setOnInsert: {
          deviceId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.json(successResponse(device, "Device updated successfully"));
  },
);
