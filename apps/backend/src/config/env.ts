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

  // AI & Identity Federation Auth Configuration
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
  // Optional real prices (USD per million tokens) for the AI cost estimate.
  AI_PRICE_INPUT_PER_MTOK: process.env.AI_PRICE_INPUT_PER_MTOK || "",
  AI_PRICE_OUTPUT_PER_MTOK: process.env.AI_PRICE_OUTPUT_PER_MTOK || "",
  // Email cost estimate (USD per 1,000 emails; ZeptoMail sells 10,000 for about $2.50).
  EMAIL_COST_PER_1000_USD: process.env.EMAIL_COST_PER_1000_USD || "0.25",

  IDENTITY_FEDERATION_ENABLED:
    process.env.IDENTITY_FEDERATION_ENABLED === "true" ||
    Boolean(process.env.IDENTITY_FEDERATION_TOKEN_FILE) ||
    Boolean(process.env.IDENTITY_FEDERATION_TOKEN),
  IDENTITY_FEDERATION_TOKEN_FILE:
    process.env.IDENTITY_FEDERATION_TOKEN_FILE || "",
  IDENTITY_FEDERATION_TOKEN: process.env.IDENTITY_FEDERATION_TOKEN || "",

  TEAMS_BREAK_WEBHOOK_URL: process.env.TEAMS_BREAK_WEBHOOK_URL || "",
  DISCORD_BREAK_WEBHOOK_URL: process.env.DISCORD_BREAK_WEBHOOK_URL || "",
  DISCORD_AUTH_WEBHOOK_URL: process.env.DISCORD_AUTH_WEBHOOK_URL || "",
  DISCORD_DAILY_FLOW_WEBHOOK_URL:
    process.env.DISCORD_DAILY_FLOW_WEBHOOK_URL || "",

  // Zoho ZeptoMail (transactional email). Without a token, emails are not
  // sent and are logged as "not configured".
  ZEPTOMAIL_TOKEN: process.env.ZEPTOMAIL_TOKEN || "",
  // India data centre by default; use https://api.zeptomail.com/v1.1/email for .com accounts.
  ZEPTOMAIL_API_URL:
    process.env.ZEPTOMAIL_API_URL || "https://api.zeptomail.in/v1.1/email",
  MAIL_FROM_ADDRESS: process.env.MAIL_FROM_ADDRESS || "",
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME || "Prosync Workforce",
  // Links put in emails.
  EMPLOYEE_DASHBOARD_URL:
    process.env.EMPLOYEE_DASHBOARD_URL || "https://employee.prosyncedu.com",
  ADMIN_DASHBOARD_URL: process.env.ADMIN_DASHBOARD_URL || "",
};
