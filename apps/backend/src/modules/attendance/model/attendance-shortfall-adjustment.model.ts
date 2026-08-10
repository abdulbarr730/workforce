import mongoose from "mongoose";

const attendanceShortfallAdjustmentSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    month: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
      index: true,
    },
    appliedMinutes: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true },
    resetByEmployeeId: { type: String, required: true },
    resetByName: { type: String, required: true },
  },
  { timestamps: true },
);

attendanceShortfallAdjustmentSchema.index({ employeeId: 1, month: 1 });

export const AttendanceShortfallAdjustment = mongoose.model(
  "AttendanceShortfallAdjustment",
  attendanceShortfallAdjustmentSchema,
);
