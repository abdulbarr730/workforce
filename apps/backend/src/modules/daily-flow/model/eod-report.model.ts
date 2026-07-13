import mongoose from "mongoose";

const eodReportSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    summary: { type: String, required: true, trim: true },
    completedItems: { type: [String], default: [] },
    top3Tasks: { type: [String], default: [] },
    blockers: { type: String, default: "" },
    hoursWorked: { type: Number, default: null },
    submittedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

eodReportSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export const EodReport = mongoose.model("EodReport", eodReportSchema);
