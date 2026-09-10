import mongoose from "mongoose";

const dayNames = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const breakScheduleSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String, required: true },
    startTime: { type: String, required: true },
    durationMinutes: { type: Number, required: true, default: 45 },
    message: { type: String, default: "" },
    reasonOptions: { type: [String], default: [] },
    requireReasonOnReturn: { type: Boolean, default: false },
    activeDays: { type: [String], default: dayNames },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

breakScheduleSchema.index({ employeeId: 1, isActive: 1 });

export const BreakSchedule = mongoose.model(
  "BreakSchedule",
  breakScheduleSchema,
);

export const BREAK_SCHEDULE_DAYS = dayNames;
