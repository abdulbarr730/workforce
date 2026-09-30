import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { AppError } from "../utils/app-error";

const FIELD_LABELS: Record<string, string> = {
  reason: "Reason",
  startDate: "Start date",
  endDate: "End date",
  type: "Leave type",
  date: "Date",
  loginTime: "Login time",
  logoutTime: "Logout time",
  name: "Name",
  email: "Email",
  password: "Password",
};

const friendlyIssue = (issue: { path: PropertyKey[]; message: string; code?: string }) => {
  const field = String(issue.path[issue.path.length - 1] ?? "");
  const label =
    FIELD_LABELS[field] ||
    (field ? field.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) : "This field");
  const missing =
    /required/i.test(issue.message) ||
    /received undefined/i.test(issue.message) ||
    /expected .* received null/i.test(issue.message);
  if (missing) return `${label} is required.`;
  // Custom messages from the schemas are already written for people.
  if (/^[A-Z]/.test(issue.message) && !/^(Invalid|Expected|String|Number)/.test(issue.message)) {
    return issue.message.endsWith(".") ? issue.message : `${issue.message}.`;
  }
  return `${label}: ${issue.message.charAt(0).toLowerCase()}${issue.message.slice(1)}.`;
};

export const validate =
  (schema: ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Plain sentences the person filling the form can act on,
        // e.g. "Reason is required."
        const messages = Array.from(
          new Set(error.issues.map((issue) => friendlyIssue(issue))),
        ).join(" ");
        return next(new AppError(messages || "Please check the form.", 400));
      }
      return next(error);
    }
  };
