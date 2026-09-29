import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // Strictly YYYY-MM-DD

export const createHolidaySchema = z.object({
  body: z.object({
    name: z.string().min(2, "Holiday name is required"),
    date: z.string().regex(dateRegex, "Date must be YYYY-MM-DD format"),
    type: z
      .enum(["NATIONAL", "COMPANY", "DEPARTMENT", "EMERGENCY"])
      .default("COMPANY"),
    paid: z.boolean().default(true),
    isActive: z.boolean().default(true),
    workingEmployeeIds: z.array(z.string().min(1)).default([]),
  }),
});

export const updateHolidaySchema = z.object({
  body: createHolidaySchema.shape.body.partial(),
});

export const requestLeaveSchema = z.object({
  body: z.object({
    startDate: z
      .string()
      .regex(dateRegex, "Start date must be YYYY-MM-DD format"),
    endDate: z.string().regex(dateRegex, "End date must be YYYY-MM-DD format"),
    // Leave types are configured by admins; the controller checks the type.
    type: z.string().trim().min(1, "Choose a leave type").max(60),
    reason: z.string().min(1, "Reason is required"),
  }),
});

export const processLeaveSchema = z.object({
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    adminReason: z.string().optional(),
  }),
});
