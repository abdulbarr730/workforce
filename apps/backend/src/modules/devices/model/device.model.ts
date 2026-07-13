import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    hostname: { type: String, default: null },
    os: { type: String, default: null },
    platform: { type: String, default: null },
    agentVersion: { type: String, default: null },
    employeeId: { type: String, default: null, index: true },
    assignedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null, index: true },
    lastEventType: { type: String, default: null },
    lastIp: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    idleTimeoutMinutes: { type: Number, default: 5 },
  },
  { timestamps: true },
);

export const Device = mongoose.model("Device", deviceSchema);
