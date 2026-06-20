import mongoose from "mongoose";

import { UserRole } from "../../../_shared/constants";

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,

      required: true,

      unique: true
    },

    departmentId: {
        type: String,

        default: null
    },

    departmentName: {
        type: String,

        default: null
    },

    name: {
      type: String,

      required: true
    },

    email: {
      type: String,

      required: true,

      unique: true
    },

    password: {
      type: String,

      required: true
    },

    role: {
      type: String,

      enum: Object.values(UserRole),

      default: UserRole.EMPLOYEE
    },

    assignedShiftPolicyId: {
        type: String,

        default: null,

        index: true
        },

        assignedShiftPolicyName: {
        type: String,

        default: null
 },

    isActive: {
      type: Boolean,

      default: true
    },

    isScreenshotTrackingEnabled: {
      type: Boolean,
      default: false
    }
  },

  {
    timestamps: true
  }
);

export const User = mongoose.model(
  "User",

  userSchema
);