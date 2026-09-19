import mongoose from "mongoose";

export type WorkforceBrainScope = "COMPANY" | "DEPARTMENT" | "EMPLOYEE";

const workforceBrainMemorySchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["COMPANY", "DEPARTMENT", "EMPLOYEE"],
      required: true,
      index: true,
    },
    key: { type: String, required: true, index: true },
    label: { type: String, required: true, trim: true },
    employeeId: { type: String, default: "", index: true },
    employeeName: { type: String, default: "" },
    departmentId: { type: String, default: "", index: true },
    departmentName: { type: String, default: "" },
    summary: { type: String, default: "" },
    operatingStyle: { type: [String], default: [] },
    commonTasks: { type: [String], default: [] },
    commonApplications: { type: [String], default: [] },
    eodWritingStyle: { type: [String], default: [] },
    checkinStyle: { type: [String], default: [] },
    assignedTaskPatterns: { type: [String], default: [] },
    promptInstructions: { type: [String], default: [] },
    departmentResponsibilities: { type: [String], default: [] },
    discoveredAppPurposes: {
      type: [
        {
          app: { type: String, default: "" },
          domain: { type: String, default: "" },
          purpose: { type: String, default: "" },
          relevance: { type: String, default: "" },
        },
      ],
      default: [],
    },
    examples: {
      type: [
        {
          date: { type: String, default: "" },
          task: { type: String, default: "" },
          interval: { type: String, default: "" },
          duration: { type: String, default: "" },
          evidence: { type: String, default: "" },
        },
      ],
      default: [],
    },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },
    sourceWindow: {
      startDate: { type: String, default: "" },
      endDate: { type: String, default: "" },
      days: { type: Number, default: 60 },
    },
    generatedBy: { type: String, default: "LOCAL_WORKFORCE_BRAIN" },
    model: { type: String, default: "" },
    confidence: { type: Number, default: 0.5 },
    lastTrainedAt: { type: Date, default: Date.now },
    nextRevisionDueAt: {
      type: Date,
      default: () => new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    },
    revisionCycleDays: { type: Number, default: 15 },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

workforceBrainMemorySchema.index({ scope: 1, key: 1 }, { unique: true });
workforceBrainMemorySchema.index({ employeeId: 1, lastTrainedAt: -1 });
workforceBrainMemorySchema.index({ departmentId: 1, lastTrainedAt: -1 });

export const WorkforceBrainMemory = mongoose.model(
  "WorkforceBrainMemory",
  workforceBrainMemorySchema,
);
