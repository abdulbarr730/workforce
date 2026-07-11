import { NextFunction, Response } from "express";

import { AuthRequest } from "./auth.middleware";

import { AppError } from "../utils/app-error";

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
