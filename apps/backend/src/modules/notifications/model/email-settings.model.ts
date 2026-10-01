import mongoose from "mongoose";

/**
 * Who emails come from, per group of emails (one document, key "default").
 * Every address must be on a domain verified in ZeptoMail; empty = the
 * server default (MAIL_FROM_ADDRESS / MAIL_FROM_NAME).
 */
const senderSchema = new mongoose.Schema(
  {
    group: { type: String, required: true },
    address: { type: String, default: "" },
    name: { type: String, default: "" },
    replyTo: { type: String, default: "" },
  },
  { _id: false },
);

const emailSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    senders: { type: [senderSchema], default: [] },
  },
  { timestamps: true },
);

export const EmailSettings = mongoose.model("EmailSettings", emailSettingsSchema);
