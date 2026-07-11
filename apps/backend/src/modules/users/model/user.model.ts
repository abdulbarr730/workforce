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

    isActive: {
      type: Boolean,

      default: true,
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
  },

  {
    timestamps: true,
  },
);

export const User = mongoose.model(
  "User",

  userSchema,
);
