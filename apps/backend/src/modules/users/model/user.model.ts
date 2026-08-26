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

    password: {
      type: String,

      required: true,
    },

    role: {
      type: String,

      enum: Object.values(UserRole),

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

    isActive: {
      type: Boolean,

      default: true,
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
  },
);

export const User = mongoose.model(
  "User",

  userSchema,
);
