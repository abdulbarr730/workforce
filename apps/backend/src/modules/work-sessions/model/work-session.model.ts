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
  },

  {
    timestamps: true,
  },
);

workSessionSchema.index({
  employeeId: 1,

  loginAt: -1,
});

export const WorkSession = mongoose.model(
  "WorkSession",

  workSessionSchema,
);
