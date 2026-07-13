import mongoose from "mongoose";

import { EventSource, EventType } from "../../../_shared/types";

const activityEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },

    employeeId: {
      type: String,
      required: true,
      index: true,
    },

    companyId: {
      type: String,
      required: true,
      index: true,
    },

    deviceId: {
      type: String,
      required: true,
    },

    sessionId: {
      type: String,
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(EventType),
      required: true,
      index: true,
    },

    source: {
      type: String,
      enum: Object.values(EventSource),
      required: true,
    },

    timestamp: {
      type: Date,
      required: true,
      index: true,
    },

    metadata: {
      type: Object,
      default: {},
    },

    invalidated: {
      type: Boolean,
      default: false,
    },

    // NEW FIELDS
    productivityCategory: {
      type: String,
      enum: ["PRODUCTIVE", "UNPRODUCTIVE", "NEUTRAL"],
      default: "NEUTRAL",
      index: true,
    },

    productivityScore: {
      type: Number,
      default: 0.5,
    },

    matchedRuleId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// THIS IS THE LINE YOU MISSED. It extracts the TypeScript interface.
export type IActivityEvent = mongoose.InferSchemaType<
  typeof activityEventSchema
>;

export const ActivityEvent = mongoose.model(
  "ActivityEvent",
  activityEventSchema,
);
