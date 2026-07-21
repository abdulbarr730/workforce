import mongoose from "mongoose";

const grievanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "RESOLVED"],
      default: "PENDING",
      index: true,
    },
    resolvedBy: {
      type: String,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolutionNote: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const Grievance =
  mongoose.models.Grievance || mongoose.model("Grievance", grievanceSchema);
