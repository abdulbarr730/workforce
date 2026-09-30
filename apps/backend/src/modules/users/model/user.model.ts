import mongoose from "mongoose";

import { UserRole } from "../../../_shared/constants";

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,

      required: true,

      unique: true,
    },

    departmentId: {
      type: String,

      default: null,
    },

    departmentName: {
      type: String,

      default: null,
    },

    departmentIds: {
      type: [String],
      default: [],
      index: true,
    },

    departmentNames: {
      type: [String],
      default: [],
    },

    name: {
      type: String,

      required: true,
    },

    email: {
      type: String,

      required: true,

      unique: true,
    },

    // bcrypt hash. Never returned by queries unless asked for with
    // .select("+password"), and stripped from toJSON/toObject (see below).
    password: {
      type: String,

      required: true,

      select: false,
    },

    // A built-in role (UserRole) or a custom role key from AccessRole
    // (e.g. CEO); custom roles act as a built-in role on the server.
    role: {
      type: String,

      default: UserRole.EMPLOYEE,
    },

    assignedShiftPolicyId: {
      type: String,

      default: null,

      index: true,
    },

    assignedShiftPolicyName: {
      type: String,

      default: null,
    },

    workingDays: {
      type: [String],
      default: [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
      ],
      index: true,
    },

    // Set when an admin issues a one-time password: that password only lets
    // the person set their own (agent or dashboard - whichever comes first).
    mustChangePassword: { type: Boolean, default: false },
    tempPasswordExpiresAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    // Emailed "set your password" link (only a hash of the token is kept).
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null },
    // A "24 hours left" reminder was sent for the current one-time password / link.
    passwordReminderSentAt: { type: Date, default: null },

    // Per-person access on top of the role (set on Roles & Logins):
    // adminPortal null = as the role; grant / revoke = extra or removed
    // "<page>.<action>" permissions (see modules/access/access-catalog.ts).
    accessOverride: {
      adminPortal: { type: Boolean, default: null },
      grant: { type: [String], default: [] },
      revoke: { type: [String], default: [] },
      updatedAt: { type: Date, default: null },
    },

    isActive: {
      type: Boolean,

      default: true,
    },

    // Admin-chosen idle timeout for this employee's agent (null = not set).
    // Kept on the employee so it survives device records being recreated.
    idleTimeoutMinutes: {
      type: Number,
      default: null,
    },
    idleTimeoutSetAt: {
      type: Date,
      default: null,
    },

    // Business date (YYYY-MM-DD) whose login was already announced on
    // Discord; guarantees exactly one login message per employee per day.
    loginAnnouncedDate: {
      type: String,
      default: null,
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },

    isScreenshotTrackingEnabled: {
      type: Boolean,
      default: false,
    },

    screenshotInterval: {
      type: Number,
      default: 300, // 5 minutes in seconds
    },

    enforceTrackingSchedule: {
      type: Boolean,
      default: false,
    },
    trackingDays: {
      type: [String],
      default: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
    },
    trackingStartTime: {
      type: String,
      default: "00:00",
    },
    trackingEndTime: {
      type: String,
      default: "23:59",
    },
    trackingDaySchedules: [
      {
        day: { type: String, required: true },
        enabled: { type: Boolean, default: false },
        startTime: { type: String, default: "09:00" },
        endTime: { type: String, default: "17:00" },
      },
    ],

    isIdleExemptionEnabled: {
      type: Boolean,
      default: false,
    },
    idleExemptionDays: {
      type: [String],
      default: [],
    },
    idleExemptionStartTime: {
      type: String,
      default: "00:00",
    },
    idleExemptionEndTime: {
      type: String,
      default: "23:59",
    },
    idleExemptionDaySchedules: [
      {
        day: { type: String, required: true },
        enabled: { type: Boolean, default: false },
        startTime: { type: String, default: "17:00" },
        endTime: { type: String, default: "21:00" },
      },
    ],

    checkinIntervalMinutes: {
      type: Number,
      default: 120, // Default to 2 hours (120 minutes)
    },
    customCheckinTimes: {
      type: [String],
      default: [], // Optional specific times, e.g. ["11:00", "14:00"]
    },
  },

  {
    timestamps: true,
    // A freshly created or explicitly selected document still holds the hash;
    // make sure it can never be serialised into an API response or webhook.
    toJSON: { transform: (_doc, ret: Record<string, unknown>) => { delete ret.password; return ret; } },
    toObject: { transform: (_doc, ret: Record<string, unknown>) => { delete ret.password; return ret; } },
  },
);

export const User = mongoose.model(
  "User",

  userSchema,
);
