import { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken";

import { env } from "../../config/env";

import { AppError } from "../utils/app-error";

export interface AuthRequest extends Request {
  user?: {
    userId: string;

    employeeId: string;

    name: string;

    role: string;

    departmentId?: string;

    departmentName?: string;
  };
}

export const authenticate = (
  req: AuthRequest,

  _res: Response,

  next: NextFunction,
) => {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
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
    };

    req.user = decoded;

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
