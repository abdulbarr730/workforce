import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // Strictly YYYY-MM-DD

export const createHolidaySchema = z.object({
  body: z.object({
    name: z.string().min(2, "Holiday name is required"),
    date: z.string().regex(dateRegex, "Date must be YYYY-MM-DD format"),
    paid: z.boolean().default(true),
    isActive: z.boolean().default(true),
  }),
});

export const requestLeaveSchema = z.object({
  body: z.object({
    startDate: z
      .string()
      .regex(dateRegex, "Start date must be YYYY-MM-DD format"),
    endDate: z.string().regex(dateRegex, "End date must be YYYY-MM-DD format"),
    type: z.enum(["CASUAL", "SICK", "ANNUAL", "EMERGENCY", "UNPAID", "PAID LEAVE"]),
    reason: z.string().min(1, "Reason is required"),
  }),
});

export const processLeaveSchema = z.object({
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    adminReason: z.string().optional(),
  }),
});
