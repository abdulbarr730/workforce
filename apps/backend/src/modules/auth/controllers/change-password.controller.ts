import { Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { env } from "../../../config/env";

/** At least 8 characters with a letter and a number. */
export const passwordProblem = (password: string) => {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Use both letters and numbers.";
  }
  return null;
};

/**
 * Set your own password. After signing in with a one-time password the
 * current password is not asked again; otherwise it is. Changing it in the
 * agent or on the dashboard is enough — the other won't ask.
 */
export const changePasswordController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const newPassword = String(req.body?.newPassword || "");
    const currentPassword = String(req.body?.currentPassword || "");
    const problem = passwordProblem(newPassword);
    if (problem) throw new AppError(`New password: ${problem}`, 400);

    const user: any = await User.findById(req.user?.userId).select("+password");
    if (!user) throw new AppError("Unauthorized", 401);

    const oneTimeSession = Boolean(req.user?.mustChangePassword && user.mustChangePassword);
    if (!oneTimeSession) {
      if (!currentPassword) throw new AppError("Current password is required.", 400);
      const ok = await bcrypt.compare(currentPassword, user.password);
      if (!ok) throw new AppError("Current password is not correct.", 400);
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new AppError("Choose a password different from the one-time / current password.", 400);
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.tempPasswordExpiresAt = null;
    user.passwordChangedAt = new Date();
    await user.save();

    // A normal session from now on.
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId || null,
        departmentName: user.departmentName || null,
      },
      env.JWT_SECRET,
      { expiresIn: "100y" },
    );
    res.json(successResponse({ token, user }, "Password changed"));
  },
);
