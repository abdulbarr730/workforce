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
    // Each leave type's limit changes, from the month made.
    typeLimitHistory: {
      type: [
        new mongoose.Schema(
          {
            code: { type: String, required: true },
            from: { type: String, required: true },
            monthlyLimit: { type: Number, default: null },
            yearlyLimit: { type: Number, default: null },
            at: { type: Date, default: Date.now },
            byName: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // Monthly / yearly limit changes, each from the month it was made. Earlier
    // months keep the limit they had.
    limitHistory: {
      type: [
        new mongoose.Schema(
          {
            from: { type: String, required: true }, // YYYY-MM ("0000-00" = before any change)
            monthlyLimit: { type: Number, default: null },
            yearlyLimit: { type: Number, default: null },
            at: { type: Date, default: Date.now },
            byName: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
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
    // This person's own leave-type limit changes, from the month made.
    typeLimitHistory: {
      type: [
        new mongoose.Schema(
          {
            code: { type: String, required: true },
            from: { type: String, required: true },
            monthlyLimit: { type: Number, default: null },
            yearlyLimit: { type: Number, default: null },
            at: { type: Date, default: Date.now },
            byName: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // This person's own monthly / yearly limit changes, from the month made.
    limitHistory: {
      type: [
        new mongoose.Schema(
          {
            from: { type: String, required: true }, // YYYY-MM ("0000-00" = before any change)
            monthlyLimit: { type: Number, default: null },
            yearlyLimit: { type: Number, default: null },
            at: { type: Date, default: Date.now },
            byName: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // Starting balance entered by an admin: from `asOfMonth` on, balances are
    // calculated from these numbers (leave before that month is already in them).
    opening: {
      type: new mongoose.Schema(
        {
          asOfMonth: { type: String, required: true }, // YYYY-MM
          monthlyCarried: { type: Number, default: 0 }, // carried-over monthly days
          floatingLeft: { type: Number, default: null }, // floating/yearly days left that year
          setBy: { type: String, default: null },
          setByName: { type: String, default: null },
          setAt: { type: Date, default: Date.now },
        },
        { _id: false },
      ),
      default: null,
    },
    updatedBy: { type: String, default: null },
    updatedByName: { type: String, default: null },
  },
  { timestamps: true },
);

export const LeaveAllowance = mongoose.model(
  "LeaveAllowance",
  leaveAllowanceSchema,
);

/**
 * Stored monthly leave balance per employee (re-saved whenever it is worked
 * out). Payroll reads from here.
 */
const leaveBalanceSnapshotSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true },
    month: { type: String, required: true }, // YYYY-MM
    monthlyLimit: { type: Number, default: null }, // earned this month
    carriedIn: { type: Number, default: 0 },
    monthlyUsed: { type: Number, default: 0 },
    monthlyLeft: { type: Number, default: null }, // left at the end of the month
    rolledOver: { type: Number, default: 0 },
    floatingOnTop: { type: Boolean, default: false },
    yearlyLimit: { type: Number, default: null },
    floatingUsed: { type: Number, default: 0 }, // this month
    yearUsedToDate: { type: Number, default: 0 }, // floating (on top) or all paid (cap)
    yearLeft: { type: Number, default: null },
    paidDays: { type: Number, default: 0 },
    unpaidDays: { type: Number, default: 0 },
    pendingDays: { type: Number, default: 0 },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
leaveBalanceSnapshotSchema.index({ employeeId: 1, month: 1 }, { unique: true });

export const LeaveBalanceSnapshot = mongoose.model(
  "LeaveBalanceSnapshot",
  leaveBalanceSnapshotSchema,
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
