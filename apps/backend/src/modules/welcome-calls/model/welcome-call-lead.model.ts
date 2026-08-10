import mongoose from "mongoose";

const assignmentHistorySchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    assignedAt: { type: Date, required: true },
    reason: { type: String, default: "INITIAL_DISTRIBUTION" },
    assignedByEmployeeId: { type: String, default: "SYSTEM" },
  },
  { _id: false },
);

const callAttemptSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    outcome: {
      type: String,
      enum: [
        "CONNECTED",
        "NOT_CONNECTED",
        "CALLBACK",
        "WRONG_NUMBER",
        "DO_NOT_CALL",
      ],
      required: true,
    },
    notes: { type: String, default: "" },
    calledAt: { type: Date, required: true },
    nextCallAt: { type: Date, default: null },
  },
  { _id: true },
);

const welcomeCallLeadSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WelcomeCallCampaign",
      required: true,
      index: true,
    },
    externalRegistrationId: { type: String, required: true, trim: true },
    source: { type: String, default: "crm", trim: true },
    registrantName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    registeredAt: { type: Date, required: true, index: true },
    webinarDate: { type: String, default: null, index: true },
    amount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: [
        "UNASSIGNED",
        "PENDING",
        "CONNECTED",
        "NOT_CONNECTED",
        "CALLBACK",
        "WRONG_NUMBER",
        "DO_NOT_CALL",
      ],
      default: "UNASSIGNED",
      index: true,
    },
    lastOutcome: { type: String, default: null, index: true },
    assignedToEmployeeId: { type: String, default: null, index: true },
    assignedToEmployeeName: { type: String, default: null },
    assignedAt: { type: Date, default: null },
    dueDate: { type: String, default: null, index: true },
    nextCallAt: { type: Date, default: null, index: true },
    attemptCount: { type: Number, default: 0 },
    redistributionCount: { type: Number, default: 0 },
    assignmentHistory: { type: [assignmentHistorySchema], default: [] },
    callAttempts: { type: [callAttemptSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

welcomeCallLeadSchema.index(
  { campaignId: 1, externalRegistrationId: 1 },
  { unique: true },
);
welcomeCallLeadSchema.index({
  campaignId: 1,
  assignedToEmployeeId: 1,
  dueDate: 1,
});
welcomeCallLeadSchema.index({ campaignId: 1, status: 1, registeredAt: -1 });
welcomeCallLeadSchema.index({ campaignId: 1, webinarDate: 1, status: 1 });

export const WelcomeCallLead = mongoose.model(
  "WelcomeCallLead",
  welcomeCallLeadSchema,
);
