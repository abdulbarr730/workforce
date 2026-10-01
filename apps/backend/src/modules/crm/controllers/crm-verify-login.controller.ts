import { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { env } from "../../../config/env";
import { User } from "../../users/model/user.model";

/**
 * Only the real CRM API key may check passwords (not admin logins, and not
 * the "no key in development" fallback of the other CRM routes).
 */
export const requireCrmApiKey = (req: Request, _res: Response, next: NextFunction) => {
  if (!env.CRM_API_KEY) return next(new AppError("CRM sign-in is not set up on the server.", 503));
  const header = req.headers["x-api-key"];
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  if (header === env.CRM_API_KEY || bearer === env.CRM_API_KEY) return next();
  return next(new AppError("Unauthorized", 401));
};

// Failed attempts per email: at most 10 in 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();
const recentFailures = (email: string) => {
  const now = Date.now();
  const list = (failures.get(email) || []).filter((t) => now - t < WINDOW_MS);
  failures.set(email, list);
  return list;
};

/**
 * POST /api/crm/auth/verify { email, password }
 * Lets the CRM sign employees in with their Workforce password, so a password
 * changed here works there at once. The password is only checked, never
 * stored or sent anywhere.
 */
export const verifyCrmLoginController = asyncHandler(async (req: Request, res: Response) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) throw new AppError("Email and password are required.", 400);

  if (recentFailures(email).length >= MAX_FAILURES) {
    throw new AppError("Too many attempts. Try again in 15 minutes.", 429);
  }

  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const user: any = await User.findOne({ email: { $regex: `^${escaped}$`, $options: "i" } }).select("+password");
  const ok = user ? await bcrypt.compare(password, user.password) : false;
  if (!user || !ok) {
    recentFailures(email).push(Date.now());
    throw new AppError("Invalid credentials", 401);
  }
  failures.delete(email);

  if (user.deletedAt || user.isActive === false) {
    throw new AppError("This account is switched off.", 403);
  }
  if (user.mustChangePassword) {
    const error = new AppError(
      "Please set your own password in the Workforce app or employee dashboard first.",
      403,
    ) as AppError & { code?: string };
    error.code = "PASSWORD_CHANGE_REQUIRED";
    throw error;
  }

  res.json(
    successResponse(
      {
        valid: true,
        employee: {
          id: String(user._id),
          employeeId: user.employeeId,
          name: user.name,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId || null,
          departmentName: user.departmentName || null,
          departmentIds: user.departmentIds || [],
          departmentNames: user.departmentNames || [],
          passwordChangedAt: user.passwordChangedAt || null,
        },
      },
      "Credentials are valid",
    ),
  );
});
