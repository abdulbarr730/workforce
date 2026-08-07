import mongoose from "mongoose";

const taskTimingSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    interval: { type: String, default: "" },
    timeTaken: { type: String, default: "" },
    count: { type: Number, min: 1, default: undefined },
    callCount: { type: Number, min: 1, default: undefined },
    isTopTask: { type: Boolean, default: false },
  },
  { _id: false },
);

const eodReportSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    summary: { type: String, required: true, trim: true },
    completedItems: { type: [String], default: [] },
    tasksWithTimings: { type: [taskTimingSchema], default: [] },
    top3Tasks: { type: [String], default: [] },
    blockers: { type: String, default: "" },
    hoursWorked: { type: Number, default: null },
    submittedAt: { type: Date, default: () => new Date() },
    eodEditCount: { type: Number, default: 0 },
    isMissedEod: { type: Boolean, default: false },
    eodHistory: {
      type: [
        {
          summary: String,
          completedItems: [String],
          beforeSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
          afterSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
          reason: String,
          editedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

eodReportSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export const EodReport = mongoose.model("EodReport", eodReportSchema);
