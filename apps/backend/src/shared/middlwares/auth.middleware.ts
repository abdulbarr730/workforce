import { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken";

import { env } from "../../config/env";

import { AppError } from "../utils/app-error";

import { User } from "../../modules/users/model/user.model";

export interface AuthRequest extends Request {
  user?: {
    userId: string;

    employeeId: string;

    name: string;

    role: string;

    departmentId?: string;

    departmentName?: string;

    // Signed in with a one-time password: may only set a new password.
    mustChangePassword?: boolean;
  };
}

export const authenticate = (
  req: AuthRequest,

  _res: Response,

  next: NextFunction,
) => {
  try {
    const apiKey =
      req.headers["x-api-key"] ||
      req.headers["apikey"] ||
      (req.query.apiKey as string);

    if (env.CRM_API_KEY && apiKey && apiKey === env.CRM_API_KEY) {
      req.user = {
        userId: "crm_integration",
        employeeId: "CRM",
        name: "CRM Integration Service",
        role: "SUPER_ADMIN",
      };
      return next();
    }

    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
      if (env.CRM_API_KEY && token === env.CRM_API_KEY) {
        req.user = {
          userId: "crm_integration",
          employeeId: "CRM",
          name: "CRM Integration Service",
          role: "SUPER_ADMIN",
        };
        return next();
      }
    } else if (req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      throw new AppError("Unauthorized", 401);
    }

    const decoded = jwt.verify(
      token,

      env.JWT_SECRET,
    ) as {
      userId: string;

      employeeId: string;

      name: string;

      role: string;

      departmentId?: string;

      departmentName?: string;

      mustChangePassword?: boolean;
    };

    req.user = decoded;

    // A one-time-password session may only set a new password (and read
    // who it is). Once the password is changed - in the agent or on the
    // dashboard - such sessions stop working and the person signs in again.
    if (decoded.mustChangePassword) {
      const path = String(req.originalUrl || "").split("?")[0];
      const allowed = /\/api\/auth\/(change-password|me)$/.test(path);
      void User.findById(decoded.userId)
        .select("mustChangePassword")
        .lean()
        .then((user: any) => {
          if (!user || !user.mustChangePassword) {
            return next(
              new AppError(
                "Your password was already changed. Please sign in with your new password.",
                401,
              ),
            );
          }
          if (!allowed) {
            const error: any = new AppError(
              "Please set a new password first.",
              403,
            );
            error.code = "PASSWORD_CHANGE_REQUIRED";
            return next(error);
          }
          return next();
        })
        .catch(() => next(new AppError("Invalid token", 401)));
      return;
    }

    next();
  } catch (error) {
    next(
      new AppError(
        "Invalid token",

        401,
      ),
    );
  }
};
