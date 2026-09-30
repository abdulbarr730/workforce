import mongoose from "mongoose";

/** One AI (Claude) request: tokens and estimated cost at the time. */
const aiUsageLogSchema = new mongoose.Schema(
  {
    feature: { type: String, default: "other", index: true },
    model: { type: String, default: null },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    status: { type: String, enum: ["OK", "FAILED"], default: "OK" },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

aiUsageLogSchema.index({ createdAt: -1 });

export const AiUsageLog = mongoose.model("AiUsageLog", aiUsageLogSchema);
