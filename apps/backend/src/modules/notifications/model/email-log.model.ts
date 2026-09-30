import mongoose from "mongoose";

/** Every email the platform tried to send (sent, failed or not configured). */
const emailLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true },
    toName: { type: String, default: null },
    employeeId: { type: String, default: null, index: true },
    subject: { type: String, required: true },
    // WELCOME | PASSWORD_RESET | ATTENDANCE_UPDATED | LEAVE_DECIDED | ...
    category: { type: String, required: true, index: true },
    status: { type: String, enum: ["SENT", "FAILED", "NOT_CONFIGURED"], required: true },
    error: { type: String, default: null },
    providerMessage: { type: String, default: null },
    sentByEmployeeId: { type: String, default: null },
    sentByName: { type: String, default: null },
  },
  { timestamps: true },
);
emailLogSchema.index({ createdAt: -1 });

export const EmailLog = mongoose.model("EmailLog", emailLogSchema);
