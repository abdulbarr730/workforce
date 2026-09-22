import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/api-response";
import { Device } from "../model/device.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";

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
    const { hostname, idleTimeoutMinutes, employeeId } = req.body;

    if (!deviceId || deviceId.startsWith("not-reported:")) {
      return res
        .status(400)
        .json(errorResponse("Cannot update a placeholder device"));
    }

    const existingDevice = await Device.findOne({ deviceId }).lean();
    let resolvedEmployeeId =
      typeof employeeId === "string" ? employeeId.trim() : "";
    if (!resolvedEmployeeId && existingDevice?.employeeId) {
      resolvedEmployeeId = String(existingDevice.employeeId);
    }
    if (!resolvedEmployeeId) {
      const latestDeviceEvent = await ActivityEvent.findOne({
        deviceId,
        employeeId: { $type: "string", $ne: "" },
        invalidated: { $ne: true },
      })
        .sort({ createdAt: -1, timestamp: -1 })
        .lean();
      if (latestDeviceEvent?.employeeId) {
        resolvedEmployeeId = String(latestDeviceEvent.employeeId);
      }
    }

    const set: Record<string, unknown> = { isActive: true };
    if (resolvedEmployeeId) {
      set.employeeId = resolvedEmployeeId;
    }
    if (hostname !== undefined) {
      set.hostname = String(hostname || "").trim() || null;
    }

    let normalizedIdleTimeout: number | null = null;
    if (idleTimeoutMinutes !== undefined) {
      normalizedIdleTimeout = normalizeIdleTimeoutMinutes(idleTimeoutMinutes);
      if (normalizedIdleTimeout === null) {
        return res
          .status(400)
          .json(
            errorResponse("Idle timeout must be between 1 and 120 minutes"),
          );
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

    if (normalizedIdleTimeout !== null && resolvedEmployeeId) {
      await Device.updateMany(
        {
          employeeId: resolvedEmployeeId,
          pendingAction: { $ne: "UNINSTALL" },
        },
        {
          $set: {
            idleTimeoutMinutes: normalizedIdleTimeout,
            isActive: true,
          },
        },
      );
      device.idleTimeoutMinutes = normalizedIdleTimeout;
      device.employeeId = resolvedEmployeeId;
    }

    return res.json(successResponse(device, "Device updated successfully"));
  },
);
