import mongoose from "mongoose";

import { AttendanceStatus } from "../types/attendance-status.enum";

const attendanceRecordSchema = new mongoose.Schema(
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

    date: {
      type: String,

      required: true,

      index: true,
    },

    attendanceStatus: {
      type: String,

      enum: Object.values(AttendanceStatus),

      required: true,

      index: true,
    },

    shiftAssigned: {
      type: String,

      default: null,
    },

    loginTime: {
      type: Date,

      default: null,
    },

    loginTimeOverridden: { type: Boolean, default: false },

    logoutTime: {
      type: Date,

      default: null,
    },

    logoutTimeOverridden: { type: Boolean, default: false },

    productiveMinutes: {
      type: Number,

      default: 0,
    },

    breakMinutes: {
      type: Number,

      default: 0,
    },

    idleMinutes: {
      type: Number,

      default: 0,
    },

    awayWorkingMinutes: {
      type: Number,

      default: 0,
    },

    lateMinutes: {
      type: Number,

      default: 0,
    },

    totalWorkedMinutes: {
      type: Number,
      default: 0,
    },

    requiredWorkMinutes: {
      type: Number,
      default: 0,
    },

    // Working hours as the shift defines them: login -> logout (or now while
    // still working), not productive time.
    workedSpanMinutes: {
      type: Number,
      default: 0,
    },

    expectedLogoutTime: {
      type: Date,
      default: null,
    },

    sessions: [
      {
        loginAt: { type: Date, required: true },
        logoutAt: { type: Date, default: null },
      },
    ],

    overtimeMinutes: {
      type: Number,

      default: 0,
    },

    anomalyDetected: {
      type: Boolean,

      default: false,
    },

    lastModifiedBy: {
      type: String,

      default: null,
    },

    auditLogRef: {
      type: String,

      default: null,
    },

    // A status set by an admin by hand stays; automatic recalculation
    // (telemetry, sweeper, recompute) does not change it.
    attendanceStatusOverridden: { type: Boolean, default: false },
    // For a Leave day set by an admin: paid (true) or unpaid (false).
    leavePaid: { type: Boolean, default: null },

    // Every change made to this day, shown to the employee.
    correctionHistory: [
      {
        correctedAt: { type: Date, default: Date.now },
        correctedBy: { type: String, required: true },
        correctedByName: { type: String, default: "" },
        correctedByRole: { type: String, default: "" },
        // REQUEST = the employee asked for it; ADMIN = changed by an admin.
        source: { type: String, default: "ADMIN" },
        requestId: { type: String, default: null },
        reason: { type: String, required: true },
        changes: { type: [String], default: [] },
        before: { type: mongoose.Schema.Types.Mixed, default: {} },
        after: { type: mongoose.Schema.Types.Mixed, default: {} },
        // When the employee saw the message (admin changes only).
        seenAt: { type: Date, default: null },
      },
    ],

    deleted: {
      type: Boolean,

      default: false,
    },

    deletedBy: {
      type: String,

      default: null,
    },

    deletedAt: {
      type: Date,

      default: null,
    },
  },

  {
    timestamps: true,
  },
);

/*
  Compound index:
  one attendance record per employee per day
*/

attendanceRecordSchema.index(
  {
    employeeId: 1,
    date: 1,
  },

  {
    unique: true,
  },
);

export const AttendanceRecord = mongoose.model(
  "AttendanceRecord",

  attendanceRecordSchema,
);
