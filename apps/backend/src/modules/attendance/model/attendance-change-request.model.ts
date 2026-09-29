import mongoose from "mongoose";

/**
 * An employee's request to correct their login/logout for a day. Approving
 * applies it to the attendance record like an admin correction; the record's
 * values before the request are kept so a Super Admin can reverse it.
 */
const snapshotSchema = new mongoose.Schema(
  {
    attendanceStatus: { type: String, default: null },
    loginTime: { type: Date, default: null },
    logoutTime: { type: Date, default: null },
    loginTimeOverridden: { type: Boolean, default: false },
    logoutTimeOverridden: { type: Boolean, default: false },
  },
  { _id: false },
);

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    byEmployeeId: { type: String, default: null },
    byName: { type: String, default: null },
    byRole: { type: String, default: null },
    action: { type: String, required: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    note: { type: String, default: "" },
  },
  { _id: false },
);

const attendanceChangeRequestSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String, default: "" },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    requestedLoginTime: { type: Date, required: true },
    requestedLogoutTime: { type: Date, default: null },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    before: { type: snapshotSchema, default: () => ({}) },
    decidedBy: { type: String, default: null },
    decidedByName: { type: String, default: null },
    decisionReason: { type: String, default: "" },
    decidedAt: { type: Date, default: null },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

attendanceChangeRequestSchema.index({ employeeId: 1, date: -1 });
attendanceChangeRequestSchema.index({ status: 1, createdAt: -1 });

export const AttendanceChangeRequest = mongoose.model(
  "AttendanceChangeRequest",
  attendanceChangeRequestSchema,
);
