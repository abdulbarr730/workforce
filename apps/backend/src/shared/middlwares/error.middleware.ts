import { NextFunction, Request, Response } from "express";

import { AppError } from "../utils/app-error";

export const errorMiddleware = (
  error: AppError,

  _req: Request,

  res: Response,

  _next: NextFunction,
) => {
  return res.status(error.statusCode || 500).json({
    success: false,

    message: error.message || "Internal Server Error",

    // e.g. PASSWORD_CHANGE_REQUIRED, so apps can react to it.
    ...((error as any).code ? { code: (error as any).code } : {}),
  });
};
