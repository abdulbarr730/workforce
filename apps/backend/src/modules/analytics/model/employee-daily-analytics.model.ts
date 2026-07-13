import mongoose, { Schema } from "mongoose";

const topAppSchema = new Schema(
  {
    app: {
      type: String,

      required: true,
    },

    seconds: {
      type: Number,

      required: true,
    },
  },

  {
    _id: false,
  },
);

const employeeDailyAnalyticsSchema = new Schema(
  {
    companyId: {
      type: String,

      required: true,

      index: true,
    },

    employeeId: {
      type: String,

      required: true,

      index: true,
    },

    departmentId: {
      type: String,

      default: null,

      index: true,
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

    productiveSeconds: {
      type: Number,

      default: 0,
    },

    unproductiveSeconds: {
      type: Number,

      default: 0,
    },

    neutralSeconds: {
      type: Number,

      default: 0,
    },

    idleSeconds: {
      type: Number,

      default: 0,
    },

    totalTrackedSeconds: {
      type: Number,

      default: 0,
    },

    focusScore: {
      type: Number,

      default: 0,
    },

    topApps: {
      type: [topAppSchema],

      default: [],
    },
  },

  {
    timestamps: true,
  },
);

employeeDailyAnalyticsSchema.index(
  {
    companyId: 1,

    employeeId: 1,

    date: 1,
  },

  {
    unique: true,
  },
);

export const EmployeeDailyAnalytics = mongoose.model(
  "EmployeeDailyAnalytics",

  employeeDailyAnalyticsSchema,
);
