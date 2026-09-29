import mongoose from "mongoose";

// Every step of a leave request (requested, edited, approved, rejected,
// cancelled) is kept here. Nothing is ever removed.
const leaveHistorySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    byEmployeeId: { type: String },
    byName: { type: String },
    byRole: { type: String },
    action: { type: String, required: true },
    fromStatus: { type: String },
    toStatus: { type: String },
    note: { type: String, default: "" },
  },
  { _id: false },
);

const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String },
    type: { type: String, required: true },
    reason: { type: String, required: true },
    startDate: { type: String, required: true }, // Enforce "YYYY-MM-DD" format
    endDate: { type: String, required: true }, // Enforce "YYYY-MM-DD" format
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
    },
    approvedBy: { type: String, default: null },
    decidedByName: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    adminReason: { type: String, default: null },
    history: { type: [leaveHistorySchema], default: [] },
  },
  { timestamps: true },
);

leaveRequestSchema.index({ startDate: 1, endDate: 1 });

export const LeaveRequest = mongoose.model("LeaveRequest", leaveRequestSchema);
