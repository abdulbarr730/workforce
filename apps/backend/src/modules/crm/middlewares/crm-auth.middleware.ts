import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../../config/env";
import { AppError } from "../../../shared/utils/app-error";

export const authenticateCrm = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const apiKeyHeader =
      req.headers["x-api-key"] ||
      req.headers["apikey"] ||
      (req.query.apiKey as string);

    // 1. If CRM_API_KEY is configured and matches header/query
    if (env.CRM_API_KEY && apiKeyHeader && apiKeyHeader === env.CRM_API_KEY) {
      return next();
    }

    // 2. Also support standard Bearer token matching CRM_API_KEY
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      if (env.CRM_API_KEY && token === env.CRM_API_KEY) {
        return next();
      }

      // 3. Fallback: Support valid Admin JWT token
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as any;
        if (
          ["SUPER_ADMIN", "ADMIN", "HR", "MANAGER"].includes(decoded?.role)
        ) {
          (req as any).user = decoded;
          return next();
        }
      } catch {
        // JWT verification failed
      }
    }

    // If no API Key configured in env yet, allow with a warning in development mode or reject in prod
    if (!env.CRM_API_KEY && process.env.NODE_ENV !== "production") {
      console.warn(
        "[CRM Auth] Warning: CRM_API_KEY is not set in .env. Allowing request in development mode.",
      );
      return next();
    }

    throw new AppError(
      "Unauthorized: Invalid or missing API key. Provide via 'X-API-KEY' header or 'Authorization: Bearer <CRM_API_KEY>'.",
      401,
    );
  } catch (error) {
    next(error);
  }
};
