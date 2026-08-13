import mongoose from "mongoose";

const responsiblePersonSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
  },
  { _id: false },
);

const memberRuleSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    departmentId: { type: String, default: null },
    departmentName: { type: String, default: null },
    enabled: { type: Boolean, default: true },
    eligibleWeekdays: { type: [String], default: [] },
    weight: { type: Number, min: 1, default: 1 },
    dailyCap: { type: Number, min: 1, default: null },
  },
  { _id: false },
);

const welcomeCallCampaignSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    registrationAmount: { type: Number, required: true, min: 0, index: true },
    webinarTitle: { type: String, default: "Weekly Webinar", trim: true },
    webinarRecurrence: {
      type: String,
      enum: ["WEEKLY"],
      default: "WEEKLY",
    },
    currency: { type: String, default: "INR", trim: true, uppercase: true },
    isActive: { type: Boolean, default: true, index: true },
    distributionMode: {
      type: String,
      enum: ["EQUAL", "WEIGHTED", "ALTERNATE_DAYS"],
      default: "EQUAL",
    },
    patternDuration: {
      type: String,
      enum: ["WEEK", "MONTH", "UNTIL_CHANGED"],
      default: "UNTIL_CHANGED",
    },
    effectiveFrom: { type: String, required: true, index: true },
    effectiveUntil: { type: String, default: null, index: true },
    responsiblePeople: { type: [responsiblePersonSchema], default: [] },
    memberRules: { type: [memberRuleSchema], default: [] },
    excludedDepartmentIds: { type: [String], default: [] },
    outcomeOptions: {
      type: [String],
      enum: [
        "CONNECTED",
        "NOT_CONNECTED",
        "CALLBACK",
        "WRONG_NUMBER",
        "DO_NOT_CALL",
      ],
      default: ["CONNECTED", "NOT_CONNECTED", "CALLBACK"],
    },
    customColumns: {
      type: [
        {
          key: { type: String, required: true },
          label: { type: String, required: true },
          options: { type: [String], default: [] },
          _id: false,
        },
      ],
      default: [],
    },
    allocationSchedule: {
      mode: {
        type: String,
        enum: ["IMMEDIATE", "SCHEDULED"],
        default: "SCHEDULED",
      },
      dailyTime: { type: String, default: "11:00" },
      timezone: { type: String, default: "Asia/Kolkata" },
      requireAgentPresence: { type: Boolean, default: true },
      weeklyRunTimes: {
        type: [
          {
            weekday: { type: String, required: true },
            time: { type: String, required: true },
            _id: false,
          },
        ],
        default: [],
      },
      webinarCutoff: {
        enabled: { type: Boolean, default: true },
        weekday: { type: String, default: "SATURDAY" },
        time: { type: String, default: "11:00" },
      },
      postWebinarImmediate: {
        enabled: { type: Boolean, default: true },
        startTime: { type: String, default: "11:00" },
        memberEmployeeIds: { type: [String], default: [] },
      },
    },
    scheduleState: {
      lastDailyRunKey: { type: String, default: null },
      lastWebinarCutoffRunKey: { type: String, default: null },
      completedRunKeys: { type: [String], default: [] },
    },
    redistribution: {
      enabled: { type: Boolean, default: true },
      afterDays: { type: Number, min: 1, max: 30, default: 1 },
      excludePreviousAssignee: { type: Boolean, default: true },
    },
    reminder: {
      enabled: { type: Boolean, default: true },
      time: { type: String, default: "16:30" },
      frequency: { type: String, enum: ["DAILY", "ONCE"], default: "DAILY" },
    },
    revision: { type: Number, min: 1, default: 1 },
    createdByEmployeeId: { type: String, required: true },
    updatedByEmployeeId: { type: String, required: true },
    updatedByName: { type: String, required: true },
  },
  { timestamps: true },
);

welcomeCallCampaignSchema.index({ isActive: 1, registrationAmount: 1 });
welcomeCallCampaignSchema.index({
  "responsiblePeople.employeeId": 1,
  isActive: 1,
});

export const WelcomeCallCampaign = mongoose.model(
  "WelcomeCallCampaign",
  welcomeCallCampaignSchema,
);
