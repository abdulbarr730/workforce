import mongoose from "mongoose";

import { ShiftDay } from "../types/shift-days.enum";

const shiftPolicySchema = new mongoose.Schema(
  {
    name: {
      type: String,

      required: true,

      unique: true,

      index: true,
    },

    description: {
      type: String,

      default: "",
    },

    /*
        Which days this applies to
      */

    activeDays: [
      {
        type: String,

        enum: Object.values(ShiftDay),
      },
    ],

    /*
        REGULAR / LATE
      */

    shiftType: {
      type: String,

      enum: ["REGULAR", "LATE", "HALF_DAY"],

      required: true,

      index: true,
    },

    /*
        10:00
      */

    shiftStartTime: {
      type: String,

      required: true,
    },

    /*
        18:30
      */

    shiftEndTime: {
      type: String,

      required: true,
    },

    /*
        Cutoff after which
        this shift applies
      */

    loginCutoffTime: {
      type: String,

      required: true,
    },

    /*
        12:30
      */

    halfDayAfterTime: {
      type: String,

      required: true,
    },

    /*
        15:00
      */

    absentAfterTime: {
      type: String,

      required: true,
    },

    /*
        Minimum required
        working duration
      */

    minimumWorkMinutes: {
      type: Number,

      default: 480,
    },

    overtimeEnabled: {
      type: Boolean,

      default: true,
    },

    overtimeAfterMinutes: {
      type: Number,

      default: 480,
    },

    /*
        EOD trigger time
      */

    eodTriggerTime: {
      type: String,

      required: true,
    },

    breakDeductionEnabled: {
      type: Boolean,

      default: false,
    },

    defaultBreakMinutes: {
      type: Number,

      default: 45,
    },

    isDefault: {
      type: Boolean,

      default: false,
    },

    isActive: {
      type: Boolean,

      default: true,
    },

    createdBy: {
      type: String,

      required: true,
    },

    updatedBy: {
      type: String,

      required: true,
    },
  },

  {
    timestamps: true,
  },
);

export const ShiftPolicy = mongoose.model(
  "ShiftPolicy",

  shiftPolicySchema,
);
