import { NextFunction, Response } from "express";

import { AuthRequest } from "./auth.middleware";

import { AppError } from "../utils/app-error";

import { permissionFor } from "../../modules/access/access-catalog";

export const authorize =
  (...allowedRoles: string[]) =>
  (
    req: AuthRequest,

    _res: Response,

    next: NextFunction,
  ) => {
    if (!req.user) {
      return next(
        new AppError(
          "Unauthorized",

          401,
        ),
      );
    }

    // Admin-portal powers given to one person: only the actions ticked for
    // them (checked in authenticate); any other admin-only change is refused.
    const path = String(req.originalUrl || "").split("?")[0];
    if (
      req.user.elevated &&
      req.method !== "GET" &&
      // Their own notifications / account are always fine.
      !/^\/api\/(notifications|auth|me)\//.test(path) &&
      !permissionFor(req.method, path) &&
      !allowedRoles.includes(req.user.ownBaseRole || "")
    ) {
      return next(new AppError("You don't have access to do this.", 403));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          "Forbidden",

          403,
        ),
      );
    }

    next();
  };
