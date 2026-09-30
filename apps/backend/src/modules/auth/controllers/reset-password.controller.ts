import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { User } from "../../users/model/user.model";
import { hashResetToken } from "../../users/controllers/admin-password.controller";
import { passwordProblem } from "./change-password.controller";

/** Public: set a new password with an emailed link (works once). */
export const resetPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const token = String(req.body?.token || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!token) throw new AppError("This link is not valid.", 400);
    const problem = passwordProblem(newPassword);
    if (problem) throw new AppError(`New password: ${problem}`, 400);

    const user: any = await (User as any)
      .findOne({
        passwordResetTokenHash: hashResetToken(token),
        passwordResetExpiresAt: { $gt: new Date() },
        deletedAt: null,
      })
      .select("+password +passwordResetTokenHash");
    if (!user) {
      throw new AppError(
        "This link has expired or was already used. Ask your admin to send a new one.",
        400,
      );
    }
    if (user.isActive === false) throw new AppError("This account is switched off.", 403);

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.mustChangePassword = false;
    user.tempPasswordExpiresAt = null;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json(successResponse({ email: user.email }, "Password set. You can sign in now."));
  },
);
