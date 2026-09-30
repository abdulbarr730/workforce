import { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken";

import { env } from "../../config/env";

import { AppError } from "../utils/app-error";

import mongoose from "mongoose";

import { User } from "../../modules/users/model/user.model";

import {
  baseRoleOf,
  isBaseRole,
  missingPermission,
  SUPER_ADMIN,
} from "../../modules/access/services/access.service";

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

    // Custom role (e.g. CEO); `role` then holds the built-in role it acts as.
    accessRole?: string;
  };
}

// Current role per user, cached briefly so every request doesn't hit the DB.
const ROLE_TTL_MS = 30_000;
const roleCache = new Map<string, { role: string | null; at: number }>();
export const clearUserRoleCache = (userId?: string) => {
  if (userId) roleCache.delete(String(userId));
  else roleCache.clear();
};
const currentRoleOf = async (userId: string) => {
  if (!mongoose.isValidObjectId(userId)) return null;
  const hit = roleCache.get(userId);
  if (hit && Date.now() - hit.at < ROLE_TTL_MS) return hit.role;
  const user: any = await User.findById(userId).select("role").lean();
  const role = user?.role || null;
  if (roleCache.size > 5000) roleCache.clear();
  roleCache.set(userId, { role, at: Date.now() });
  return role;
};

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
    const path = String(req.originalUrl || "").split("?")[0];

    const finish = async () => {
      // A one-time-password session may only set a new password (and read
      // who it is). Once the password is changed - in the agent or on the
      // dashboard - such sessions stop working and the person signs in again.
      if (decoded.mustChangePassword) {
        const user: any = await User.findById(decoded.userId).select("mustChangePassword").lean();
        if (!user || !user.mustChangePassword) {
          throw new AppError(
            "Your password was already changed. Please sign in with your new password.",
            401,
          );
        }
        if (!/\/api\/auth\/(change-password|me)$/.test(path)) {
          const error: any = new AppError("Please set a new password first.", 403);
          error.code = "PASSWORD_CHANGE_REQUIRED";
          throw error;
        }
        return;
      }

      // Roles: use the person's current role (a change applies at once).
      // Custom roles (e.g. CEO) act as their base role on the server; the
      // original is kept in accessRole. A switched-off role can't be used.
      const currentRole = (await currentRoleOf(decoded.userId)) || decoded.role;
      if (currentRole !== SUPER_ADMIN && !isBaseRole(currentRole)) {
        const base = await baseRoleOf(currentRole);
        if (!base) {
          throw new AppError("Your role has been switched off. Please contact your admin.", 403);
        }
        req.user!.accessRole = currentRole;
        req.user!.role = base;
      } else {
        req.user!.role = currentRole;
      }

      // Limited admin-portal roles: check the action against their pages.
      const missing = await missingPermission(currentRole, req.method, path);
      if (missing) {
        throw new AppError("You don't have access to do this. Ask for it to be added to your role.", 403);
      }
    };

    finish().then(() => next(), next);
  } catch (error) {
    next(
      new AppError(
        "Invalid token",

        401,
      ),
    );
  }
};
