import mongoose from "mongoose";

// Leave types, per-employee limits and blocked days. Admins can delete a
// leave type from the settings; blocks are switched off, never deleted.

const leaveTypeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true }, // e.g. "CASUAL", stored on leaves
    name: { type: String, required: true }, // e.g. "Casual Leave"
    monthlyLimit: { type: Number, default: null }, // days; null = no limit
    yearlyLimit: { type: Number, default: null },
    isPaid: { type: Boolean, default: true }, // unpaid types never use the balance
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const leavePolicySchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    types: { type: [leaveTypeSchema], default: [] },
    // Paid leave earned per month, all types together (null = no limit).
    totalMonthlyLimit: { type: Number, default: null },
    // Floating paid leave per year (or the yearly cap). Never rolls over.
    totalYearlyLimit: { type: Number, default: null },
    // true: floating leave is extra, on top of the monthly leave.
    floatingOnTop: { type: Boolean, default: false },
    // Unused monthly leave rolls over to the next month / year (on by default).
    rolloverEnabled: { type: Boolean, default: true },
    // When rollover was switched on or off ("YYYY-MM"); earlier carry stays.
    rolloverHistory: {
      type: [
        new mongoose.Schema(
          {
            from: { type: String, required: true },
            enabled: { type: Boolean, required: true },
            at: { type: Date, default: Date.now },
            byName: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // First month monthly leave is earned (set when a monthly limit is first saved).
    accrualStartMonth: { type: String, default: null },
    updatedBy: { type: String, default: null },
    updatedByName: { type: String, default: null },
  },
  { timestamps: true },
);

export const LeavePolicy = mongoose.model("LeavePolicy", leavePolicySchema);

const allowanceLimitSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    monthlyLimit: { type: Number, default: null },
    yearlyLimit: { type: Number, default: null },
  },
  { _id: false },
);

/** Per-employee limits that override the leave type's default limits. */
const leaveAllowanceSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true },
    limits: { type: [allowanceLimitSchema], default: [] },
    totalMonthlyLimit: { type: Number, default: null },
    totalYearlyLimit: { type: Number, default: null },
    // null = follow the company setting.
    floatingOnTop: { type: Boolean, default: null },
    updatedBy: { type: String, default: null },
    updatedByName: { type: String, default: null },
  },
  { timestamps: true },
);

export const LeaveAllowance = mongoose.model(
  "LeaveAllowance",
  leaveAllowanceSchema,
);

/** Days on which leave cannot be requested, by everyone or chosen people. */
const leaveBlockSchema = new mongoose.Schema(
  {
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true },
    scope: { type: String, enum: ["ALL", "EMPLOYEES"], default: "ALL" },
    employeeIds: { type: [String], default: [] },
    reason: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, default: null },
    createdByName: { type: String, default: null },
    updatedBy: { type: String, default: null },
    updatedByName: { type: String, default: null },
  },
  { timestamps: true },
);

leaveBlockSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

export const LeaveBlock = mongoose.model("LeaveBlock", leaveBlockSchema);
