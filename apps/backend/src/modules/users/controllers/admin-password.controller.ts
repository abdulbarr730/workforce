import { Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import {
  sendPasswordSetEmail,
  sendResetLinkEmail,
} from "../../../shared/services/email.service";
import { passwordProblem } from "../../auth/controllers/change-password.controller";
import { env } from "../../../config/env";
import { User } from "../model/user.model";

/** How long an emailed "set your password" link works. */
export const RESET_LINK_HOURS = 72;

export const hashResetToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const loadTarget = async (req: AuthRequest) => {
  const user: any = await User.findById(req.params.id).select("+password");
  if (!user || user.deletedAt) throw new AppError("Employee not found", 404);
  if (user.role === "SUPER_ADMIN" && req.user?.role !== "SUPER_ADMIN") {
    throw new AppError("You can't change this account.", 403);
  }
  return user;
};

const emailMessage = (status: string, sentText: string) =>
  status === "SENT"
    ? sentText
    : status === "NOT_CONFIGURED"
      ? "Email is not set up on the server, so nothing was sent."
      : "The email could not be sent. Please try again.";

/**
 * Admin types a new password for someone.
 * requireChange (default on): it works once, then they choose their own.
 * sendEmail: email the new password to them.
 */
export const setUserPasswordController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const password = String(req.body?.password || "");
    const requireChange = req.body?.requireChange !== false;
    const sendEmail = req.body?.sendEmail === true;
    const problem = passwordProblem(password);
    if (problem) throw new AppError(`Password: ${problem}`, 400);

    const user = await loadTarget(req);
    user.password = await bcrypt.hash(password, 10);
    user.mustChangePassword = requireChange;
    user.tempPasswordExpiresAt = requireChange
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : null;
    user.passwordReminderSentAt = null;
    if (!requireChange) user.passwordChangedAt = new Date();
    await user.save();

    if (!sendEmail) {
      return res.json(successResponse({ emailStatus: null }, "Password updated."));
    }
    const result = await sendPasswordSetEmail({
      to: user.email,
      name: user.name,
      employeeId: user.employeeId,
      password,
      mustChange: requireChange,
      sentBy: { employeeId: req.user?.employeeId, name: req.user?.name },
    });
    res.json(
      successResponse(
        { emailStatus: result.status },
        `Password updated. ${emailMessage(result.status, `Emailed to ${user.email}.`)}`,
      ),
    );
  },
);

/**
 * Admin emails a "set your password" link. The current password keeps
 * working until the link is used; the link works once and expires.
 */
export const sendResetLinkController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const user = await loadTarget(req);
    const token = crypto.randomBytes(32).toString("hex");
    user.passwordResetTokenHash = hashResetToken(token);
    user.passwordResetExpiresAt = new Date(Date.now() + RESET_LINK_HOURS * 60 * 60 * 1000);
    user.passwordReminderSentAt = null;
    await user.save();

    const link = `${env.EMPLOYEE_DASHBOARD_URL}/reset-password?token=${token}`;
    const result = await sendResetLinkEmail({
      to: user.email,
      name: user.name,
      employeeId: user.employeeId,
      link,
      expiresInHours: RESET_LINK_HOURS,
      sentBy: { employeeId: req.user?.employeeId, name: req.user?.name },
    });
    res.json(
      successResponse(
        { emailStatus: result.status },
        emailMessage(result.status, `Password link emailed to ${user.email}.`),
      ),
    );
  },
);
