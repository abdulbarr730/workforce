import mongoose, { Schema } from "mongoose";

export type AppCategory = "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";

const appKnowledgeSchema = new Schema(
  {
    appName: { type: String, required: true, trim: true, index: true },
    domain: { type: String, default: "", trim: true, index: true },
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
  },
  { timestamps: true },
);

appKnowledgeSchema.index({ appName: 1, domain: 1 }, { unique: true });

export const AppKnowledge = mongoose.model("AppKnowledge", appKnowledgeSchema);
