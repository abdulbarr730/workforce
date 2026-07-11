import { Request, Response } from "express";
import { DeviceError } from "../model/device-error.model";
import { Device } from "../model/device.model";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AppError } from "../../../shared/utils/app-error";

export const logError = asyncHandler(async (req: Request, res: Response) => {
  const { deviceId, employeeId, errorType, errorMessage, stackTrace } =
    req.body;

  if (!deviceId || !errorType || !errorMessage) {
    throw new AppError("Missing required fields", 400);
  }

  // Deduplication: Only create if the exact same error hasn't happened in the last hour for this device
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const existingError = await DeviceError.findOne({
    deviceId,
    errorMessage,
    createdAt: { $gte: oneHourAgo },
  });

  if (!existingError) {
    await DeviceError.create({
      deviceId,
      employeeId,
      errorType,
      errorMessage,
      stackTrace,
      isRead: false,
    });

    // Also update the device's lastSeenAt so we know it's online but having issues
    await Device.findOneAndUpdate({ deviceId }, { lastSeenAt: new Date() });
  }

  res.status(200).json({
    status: "success",
    message: "Error logged successfully",
  });
});

export const getErrors = asyncHandler(async (req: Request, res: Response) => {
  const unreadOnly = req.query.unreadOnly === "true";

  const query = unreadOnly ? { isRead: false } : {};

  const errors = await DeviceError.find(query)
    .sort({ createdAt: -1 })
    .limit(100);

  res.status(200).json({
    status: "success",
    data: {
      errors,
    },
  });
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  await DeviceError.updateMany({ isRead: false }, { isRead: true });

  res.status(200).json({
    status: "success",
    message: "Errors marked as read",
  });
});
