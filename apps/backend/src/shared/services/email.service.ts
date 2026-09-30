import { env } from "../../config/env";
import { EmailLog } from "../../modules/notifications/model/email-log.model";
import { User } from "../../modules/users/model/user.model";

export type EmailCategory =
  | "WELCOME"
  | "PASSWORD_RESET"
  | "PASSWORD_REMINDER"
  | "ATTENDANCE_UPDATED"
  | "LEAVE_DECIDED"
  | "CORRECTION_DECIDED"
  | "REMOTE_START_DECIDED";

type Actor = { employeeId?: string | null; name?: string | null } | undefined;

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const isEmailConfigured = () => Boolean(env.ZEPTOMAIL_TOKEN && env.MAIL_FROM_ADDRESS);

/** Wraps content in a simple, readable email layout. */
const layout = (title: string, bodyHtml: string, button?: { label: string; url: string }) => `
<div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#4f46e5;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold">${escapeHtml(env.MAIL_FROM_NAME)}</div>
    <div style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6">
      <h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(title)}</h2>
      ${bodyHtml}
      ${
        button
          ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(button.url)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;display:inline-block">${escapeHtml(button.label)}</a></p>`
          : ""
      }
    </div>
    <div style="padding:12px 24px;background:#f8fafc;color:#64748b;font-size:12px">This is an automatic message. Please do not reply.</div>
  </div>
</div>`;

const rows = (items: Array<[string, string]>) =>
  `<table style="border-collapse:collapse;margin:8px 0">${items
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>`;

/**
 * Sends one email through Zoho ZeptoMail and records it in the email log.
 * Never throws: a failed email must not break the action that triggered it.
 */
export async function sendEmail(input: {
  to: string;
  toName?: string | null;
  employeeId?: string | null;
  subject: string;
  html: string;
  category: EmailCategory;
  sentBy?: Actor;
}) {
  const log = {
    to: input.to,
    toName: input.toName || null,
    employeeId: input.employeeId || null,
    subject: input.subject,
    category: input.category,
    sentByEmployeeId: input.sentBy?.employeeId || null,
    sentByName: input.sentBy?.name || null,
  };
  if (!isEmailConfigured()) {
    await EmailLog.create({ ...log, status: "NOT_CONFIGURED", error: "ZeptoMail is not set up on the server." }).catch(() => undefined);
    return { sent: false, status: "NOT_CONFIGURED" as const };
  }
  try {
    const response = await fetch(env.ZEPTOMAIL_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: env.ZEPTOMAIL_TOKEN.startsWith("Zoho-enczapikey")
          ? env.ZEPTOMAIL_TOKEN
          : `Zoho-enczapikey ${env.ZEPTOMAIL_TOKEN}`,
      },
      body: JSON.stringify({
        from: { address: env.MAIL_FROM_ADDRESS, name: env.MAIL_FROM_NAME },
        to: [{ email_address: { address: input.to, name: input.toName || input.to } }],
        subject: input.subject,
        htmlbody: input.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      await EmailLog.create({ ...log, status: "FAILED", error: `HTTP ${response.status}: ${text.slice(0, 500)}` }).catch(() => undefined);
      return { sent: false, status: "FAILED" as const };
    }
    await EmailLog.create({ ...log, status: "SENT", providerMessage: text.slice(0, 500) }).catch(() => undefined);
    return { sent: true, status: "SENT" as const };
  } catch (error) {
    await EmailLog.create({
      ...log,
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    return { sent: false, status: "FAILED" as const };
  }
}

// ── Messages ─────────────────────────────────────────────────────────────

/** Login details with a one-time password (new account or password reset). */
export async function sendLoginDetailsEmail(input: {
  to: string;
  name: string;
  employeeId: string;
  tempPassword: string;
  isReset?: boolean;
  sentBy?: Actor;
}) {
  const title = input.isReset ? "Your password was reset" : "Welcome — your login details";
  const html = layout(
    title,
    `<p>Hi ${escapeHtml(input.name)},</p>
     <p>${
       input.isReset
         ? "An admin has reset your password. Use this one-time password to sign in:"
         : "Your account has been created. Use these details to sign in to the Workforce Agent or the employee dashboard:"
     }</p>
     ${rows([
       ["Email", input.to],
       ["Employee ID", input.employeeId],
       ["One-time password", input.tempPassword],
     ])}
     <p>This password works only once: when you sign in, you will be asked to set your own password.
     Changing it in the agent or on the dashboard is enough — you won't be asked again.
     The one-time password expires in 7 days.</p>`,
    { label: "Open the employee dashboard", url: `${env.EMPLOYEE_DASHBOARD_URL}/login` },
  );
  return sendEmail({
    to: input.to,
    toName: input.name,
    employeeId: input.employeeId,
    subject: input.isReset ? "Your password was reset" : "Your Workforce login details",
    html,
    category: input.isReset ? "PASSWORD_RESET" : "WELCOME",
    sentBy: input.sentBy,
  });
}

/** A link to set a new password (valid for a limited time). */
export async function sendResetLinkEmail(input: {
  to: string;
  name: string;
  employeeId: string;
  link: string;
  expiresInHours: number;
  sentBy?: Actor;
}) {
  const html = layout(
    "Set your password",
    `<p>Hi ${escapeHtml(input.name)},</p>
     <p>Use the button below to set a new password for your Workforce account
     (email: <b>${escapeHtml(input.to)}</b>). The link works once and expires in
     ${input.expiresInHours} hours.</p>
     <p>If you did not expect this, contact your admin.</p>`,
    { label: "Set my password", url: input.link },
  );
  return sendEmail({
    to: input.to,
    toName: input.name,
    employeeId: input.employeeId,
    subject: "Set your Workforce password",
    html,
    category: "PASSWORD_RESET",
    sentBy: input.sentBy,
  });
}

/** An admin set a new password for the person. */
export async function sendPasswordSetEmail(input: {
  to: string;
  name: string;
  employeeId: string;
  password: string;
  mustChange: boolean;
  sentBy?: Actor;
}) {
  const html = layout(
    "Your password was changed",
    `<p>Hi ${escapeHtml(input.name)},</p>
     <p>An admin set a new password for your account.</p>
     ${rows([
       ["Email", input.to],
       ["Password", input.password],
     ])}
     <p>${
       input.mustChange
         ? "When you sign in you will be asked to choose your own password (in the agent or on the dashboard — only once)."
         : "You can change it any time from your profile."
     }</p>`,
    { label: "Open the employee dashboard", url: `${env.EMPLOYEE_DASHBOARD_URL}/login` },
  );
  return sendEmail({
    to: input.to,
    toName: input.name,
    employeeId: input.employeeId,
    subject: "Your Workforce password was changed",
    html,
    category: "PASSWORD_RESET",
    sentBy: input.sentBy,
  });
}

/** Reminder: the one-time password / link expires within 24 hours. */
export async function sendPasswordExpiryReminder(input: {
  to: string;
  name: string;
  employeeId: string;
  expiresAt: Date;
  kind: "PASSWORD" | "LINK";
}) {
  const when = input.expiresAt.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const isLink = input.kind === "LINK";
  const html = layout(
    "Please set your password — less than 24 hours left",
    `<p>Hi ${escapeHtml(input.name)},</p>
     <p>You haven't set your own password yet. ${
       isLink ? "The password link we sent you" : "The one-time password we sent you"
     } expires on <b>${escapeHtml(when)}</b>.</p>
     <p>${
       isLink
         ? "Open our earlier email and use its \"Set my password\" button before then."
         : "Sign in with the one-time password from our earlier email and choose your own password."
     } If you can't find it, ask your admin to send a new one.</p>`,
    isLink ? undefined : { label: "Sign in", url: `${env.EMPLOYEE_DASHBOARD_URL}/login` },
  );
  return sendEmail({
    to: input.to,
    toName: input.name,
    employeeId: input.employeeId,
    subject: "Reminder: set your Workforce password (expires within 24 hours)",
    html,
    category: "PASSWORD_REMINDER",
  });
}

/** A short "something about you changed" email to an employee. */
export async function notifyEmployeeByEmail(input: {
  employeeId: string;
  category: EmailCategory;
  subject: string;
  title: string;
  lines: string[];
  details?: Array<[string, string]>;
  buttonPath?: string;
  sentBy?: Actor;
}) {
  const user: any = await User.findOne({ employeeId: input.employeeId }).select("email name").lean();
  if (!user?.email) return { sent: false, status: "FAILED" as const };
  const html = layout(
    input.title,
    `<p>Hi ${escapeHtml(user.name)},</p>
     ${input.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
     ${input.details?.length ? rows(input.details) : ""}`,
    input.buttonPath
      ? { label: "Open the employee dashboard", url: `${env.EMPLOYEE_DASHBOARD_URL}${input.buttonPath}` }
      : undefined,
  );
  return sendEmail({
    to: user.email,
    toName: user.name,
    employeeId: input.employeeId,
    subject: input.subject,
    html,
    category: input.category,
    sentBy: input.sentBy,
  });
}

/** A readable one-time password (no look-alike characters). */
export function generateTempPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits + "@#$%";
  const pick = (set: string) => set[require("crypto").randomInt(set.length)];
  const chars = [pick(letters), pick(letters.toUpperCase()), pick(digits), pick("@#$%")];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = require("crypto").randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
