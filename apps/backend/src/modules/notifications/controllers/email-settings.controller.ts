import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { env } from "../../../config/env";
import { isEmailConfigured, sendTestEmail } from "../../../shared/services/email.service";
import { EmailSettings } from "../model/email-settings.model";
import { User } from "../../users/model/user.model";
import {
  clearSenderCache,
  isEmail,
  listSenders,
  SENDER_GROUPS,
} from "../services/email-senders.service";

const domainOf = (address: string) => address.split("@")[1]?.toLowerCase() || "";

/** GET /api/notifications/email-settings: sender per group of emails. */
export const getEmailSettingsController = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(
    successResponse({
      configured: isEmailConfigured(),
      defaultSender: { address: env.MAIL_FROM_ADDRESS || null, name: env.MAIL_FROM_NAME },
      groups: await listSenders(),
    }),
  );
});

/** PUT /api/notifications/email-settings { senders: [{ group, address, name, replyTo }] } */
export const updateEmailSettingsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input: any[] = Array.isArray(req.body?.senders) ? req.body.senders : [];
  const senders = [];
  const warnings: string[] = [];
  const verifiedDomain = domainOf(env.MAIL_FROM_ADDRESS || "");
  for (const group of SENDER_GROUPS) {
    const row = input.find((s) => s?.group === group.key) || {};
    const address = String(row.address || "").trim().toLowerCase();
    const name = String(row.name || "").trim().slice(0, 80);
    const replyTo = String(row.replyTo || "").trim().toLowerCase();
    if (address && !isEmail(address)) throw new AppError(`${group.label}: "${address}" is not an email address.`, 400);
    if (replyTo && !isEmail(replyTo)) throw new AppError(`${group.label}: reply-to "${replyTo}" is not an email address.`, 400);
    if (address && verifiedDomain && domainOf(address) !== verifiedDomain) {
      warnings.push(`${group.label}: ${address} is not on ${verifiedDomain}; make sure its domain is verified in ZeptoMail.`);
    }
    senders.push({ group: group.key, address, name, replyTo });
  }
  await EmailSettings.updateOne({ key: "default" }, { $set: { senders } }, { upsert: true });
  clearSenderCache();
  res.json(
    successResponse(
      { groups: await listSenders(), warnings },
      warnings.length ? `Saved. ${warnings.join(" ")}` : "Email senders saved.",
    ),
  );
});

/** POST /api/notifications/email-settings/test { group }: test email to yourself. */
export const sendTestEmailController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const group = SENDER_GROUPS.find((g) => g.key === req.body?.group);
  if (!group) throw new AppError("Choose which sender to test.", 400);
  const me: any = await User.findById(req.user?.userId).select("email name employeeId").lean();
  if (!me?.email) throw new AppError("Your account has no email address.", 400);
  const result = await sendTestEmail({
    to: me.email,
    name: me.name,
    employeeId: me.employeeId,
    group: group.key,
    groupLabel: group.label,
    sentBy: { employeeId: req.user?.employeeId, name: req.user?.name },
  });
  res.json(
    successResponse(
      { status: result.status },
      result.status === "SENT"
        ? `Test email sent to ${me.email}. Check the inbox (and spam).`
        : result.status === "NOT_CONFIGURED"
          ? "Email is not set up on the server yet (ZEPTOMAIL_TOKEN / MAIL_FROM_ADDRESS)."
          : "The test email failed. The reason is in the email log below.",
    ),
  );
});
