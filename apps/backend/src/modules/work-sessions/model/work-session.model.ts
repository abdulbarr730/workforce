import mongoose, { Schema } from "mongoose";

const workSessionSchema = new Schema(
  {
    employeeId: {
      type: String,

      required: true,

      index: true,
    },

    employeeName: {
      type: String,

      required: true,
    },

    departmentId: {
      type: String,

      default: null,
    },

    departmentName: {
      type: String,

      default: null,
    },

    loginAt: {
      type: Date,

      required: true,
    },

    logoutAt: {
      type: Date,

      default: null,
    },

    status: {
      type: String,

      enum: ["ACTIVE", "COMPLETED"],

      default: "ACTIVE",
    },

    todoList: {
      type: [String],

      default: [],
    },

    completedTasks: {
      type: [String],

      default: [],
    },

    pendingTasks: {
      type: [String],

      default: [],
    },

    blockers: {
      type: String,

      default: "",
    },

    eodReport: {
      type: String,

      default: "",
    },

    totalWorkedSeconds: {
      type: Number,

      default: 0,
    },

    autoClosed: {
      type: Boolean,
      default: false,
    },

    // Set when an admin's attendance correction places this session outside
    // the employee's real working day (e.g. a false midnight session). The
    // row is kept for audit; readers skip it via COUNTED_SESSION_FILTER.
    excludedByAdmin: {
      type: Boolean,
      default: false,
    },
    excludedReason: {
      type: String,
      default: null,
    },
    excludedBy: {
      type: String,
      default: null,
    },
    excludedAt: {
      type: Date,
      default: null,
    },
  },

  {
    timestamps: true,
  },
);

workSessionSchema.index({
  employeeId: 1,

  loginAt: -1,
});

workSessionSchema.index({ loginAt: 1 });
workSessionSchema.index({ employeeId: 1, status: 1, logoutAt: 1, loginAt: -1 });

export const WorkSession = mongoose.model(
  "WorkSession",

  workSessionSchema,
);

/** Query fragment for sessions that count toward attendance and analytics. */
export const COUNTED_SESSION_FILTER = { excludedByAdmin: { $ne: true } };
