import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String, required: true },
    entityType: {
      type: String,
      enum: ["TODO", "EOD", "LEAVE"],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true },
    entityDate: { type: String, default: null },
    reason: { type: String, default: "" },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    diff: {
      type: mongoose.Schema.Types.Mixed,
      default: { added: [], removed: [], changed: [] },
    },
    deepLink: { type: String, required: true },
    audienceRoles: {
      type: [String],
      default: ["ADMIN", "SUPER_ADMIN", "HR"],
      index: true,
    },
    readBy: { type: [String], default: [] },
    changedBy: {
      employeeId: { type: String, default: "" },
      name: { type: String, default: "" },
      role: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

adminNotificationSchema.index({ audienceRoles: 1, createdAt: -1 });
adminNotificationSchema.index({
  audienceRoles: 1,
  entityType: 1,
  createdAt: -1,
});

export const AdminNotification = mongoose.model(
  "AdminNotification",
  adminNotificationSchema,
);
