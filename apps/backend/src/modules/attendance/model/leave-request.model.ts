import mongoose from "mongoose";

const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    startDate: { type: String, required: true }, // Enforce "YYYY-MM-DD" format
    endDate: { type: String, required: true }, // Enforce "YYYY-MM-DD" format
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    approvedBy: { type: String, default: null },
  },
  { timestamps: true },
);

export const LeaveRequest = mongoose.model("LeaveRequest", leaveRequestSchema);
