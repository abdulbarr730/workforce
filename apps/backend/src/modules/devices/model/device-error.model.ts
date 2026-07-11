import mongoose, { Schema, Document } from "mongoose";

export interface IDeviceError extends Document {
  deviceId: string;
  employeeId?: string;
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceErrorSchema = new Schema(
  {
    deviceId: { type: String, required: true },
    employeeId: { type: String },
    errorType: { type: String, required: true },
    errorMessage: { type: String, required: true },
    stackTrace: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Indexes to speed up queries and deduplication
DeviceErrorSchema.index({ deviceId: 1, errorMessage: 1 });
DeviceErrorSchema.index({ isRead: 1 });
DeviceErrorSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 },
); // Auto-delete after 7 days

export const DeviceError =
  mongoose.models.DeviceError ||
  mongoose.model<IDeviceError>("DeviceError", DeviceErrorSchema);
