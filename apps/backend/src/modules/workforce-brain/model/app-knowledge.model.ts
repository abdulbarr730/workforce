import mongoose, { Schema } from "mongoose";

export type AppCategory = "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";

const appKnowledgeSchema = new Schema(
  {
    appName: { type: String, required: true, trim: true, index: true },
    appKey: { type: String, default: "", trim: true, index: true },
    domain: { type: String, default: "", trim: true, index: true },
    domainKey: { type: String, default: "", trim: true, index: true },
    category: {
      type: String,
      enum: ["PRODUCTIVE", "UNPRODUCTIVE", "NEUTRAL"],
      default: "PRODUCTIVE",
    },
    purpose: { type: String, required: true, trim: true },
    targetDepartments: { type: [String], default: [] },
    activityTemplates: { type: [String], default: [] },
    commonUrls: { type: [String], default: [] },
    classifiedBy: {
      type: String,
      enum: ["AI", "ADMIN", "SYSTEM"],
      default: "AI",
    },
    lastClassifiedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    seenCount: { type: Number, default: 0 },
    sourceExamples: {
      type: [
        {
          app: { type: String, default: "" },
          domain: { type: String, default: "" },
          title: { type: String, default: "" },
          url: { type: String, default: "" },
          seenAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    adminNotes: { type: String, default: "" },
  },
  { timestamps: true },
);

appKnowledgeSchema.index(
  { appKey: 1, domainKey: 1 },
  {
    unique: true,
    partialFilterExpression: { appKey: { $exists: true, $type: "string" } },
  },
);
appKnowledgeSchema.index({ appName: 1, domain: 1 });

export const AppKnowledge = mongoose.model("AppKnowledge", appKnowledgeSchema);
