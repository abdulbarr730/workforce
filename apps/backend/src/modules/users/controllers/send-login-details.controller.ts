import { Response } from "express";
import bcrypt from "bcrypt";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import {
  generateTempPassword,
  sendLoginDetailsEmail,
} from "../../../shared/services/email.service";
import { User } from "../model/user.model";

/**
 * Admin: reset someone's password to a new one-time password and email it.
 * Their old password stops working; they set their own on next sign-in.
 */
export const sendLoginDetailsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const user: any = await User.findById(req.params.id).select("+password");
    if (!user) throw new AppError("Employee not found", 404);
    if (user.role === "SUPER_ADMIN" && req.user?.role !== "SUPER_ADMIN") {
      throw new AppError("You can't reset this account.", 403);
    }
    const tempPassword = generateTempPassword();
    user.password = await bcrypt.hash(tempPassword, 10);
    user.mustChangePassword = true;
    user.tempPasswordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    user.passwordReminderSentAt = null;
    await user.save();

    const result = await sendLoginDetailsEmail({
      to: user.email,
      name: user.name,
      employeeId: user.employeeId,
      tempPassword,
      isReset: true,
      sentBy: { employeeId: req.user?.employeeId, name: req.user?.name },
    });
    res.json(
      successResponse(
        { emailStatus: result.status },
        result.status === "SENT"
          ? `New login details emailed to ${user.email}.`
          : result.status === "NOT_CONFIGURED"
            ? "Email is not set up on the server, so nothing was sent."
            : "The email could not be sent. Please try again.",
      ),
    );
  },
);
