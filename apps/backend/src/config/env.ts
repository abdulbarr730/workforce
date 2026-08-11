import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: process.env.PORT || "5000",

  MONGO_URI: process.env.MONGO_URI || "",

  JWT_SECRET: process.env.JWT_SECRET || "",

  CRM_API_KEY: process.env.CRM_API_KEY || "",
  CRM_WEBHOOK_URL: process.env.CRM_WEBHOOK_URL || "",
  CRM_WEBHOOK_SECRET: process.env.CRM_WEBHOOK_SECRET || "",

  WELCOME_CALL_SHEET_WEBHOOK_URL:
    process.env.WELCOME_CALL_SHEET_WEBHOOK_URL || "",
  WELCOME_CALL_SHEET_WEBHOOK_SECRET:
    process.env.WELCOME_CALL_SHEET_WEBHOOK_SECRET || "",
  WELCOME_CALL_SHEET_NAME:
    process.env.WELCOME_CALL_SHEET_NAME || "Welcome calls",

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",

  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  OPENROUTER_MODEL:
    process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free",
  OPENROUTER_SITE_URL:
    process.env.OPENROUTER_SITE_URL || "https://prosynchub.com",
  OPENROUTER_APP_NAME:
    process.env.OPENROUTER_APP_NAME || "ProSync Workforce Platform",
};
