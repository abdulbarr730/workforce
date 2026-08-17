import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    date: { type: String, required: true, index: true }, // Enforce "YYYY-MM-DD" format
    type: {
      type: String,
      enum: ["NATIONAL", "COMPANY", "DEPARTMENT", "EMERGENCY"],
      default: "COMPANY",
    },
    paid: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    workingEmployeeIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const Holiday = mongoose.model("Holiday", holidaySchema);
