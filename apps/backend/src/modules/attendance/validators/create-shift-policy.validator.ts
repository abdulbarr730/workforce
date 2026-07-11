import { z } from "zod";
import { ShiftDay } from "../types/shift-days.enum";

// Enforces exact HH:mm 24-hour format
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createShiftPolicySchema = z.object({
  body: z.object({
    name: z.string().min(3, "Name must be at least 3 characters"),
    description: z.string().optional(),
    activeDays: z
      .array(z.nativeEnum(ShiftDay))
      .min(1, "At least one active day is required"),
    shiftType: z.enum(["REGULAR", "LATE", "HALF_DAY"]),
    shiftStartTime: z
      .string()
      .regex(timeRegex, "Invalid shiftStartTime format. Use HH:mm (24-hour)"),
    shiftEndTime: z
      .string()
      .regex(timeRegex, "Invalid shiftEndTime format. Use HH:mm (24-hour)"),
    loginCutoffTime: z
      .string()
      .regex(timeRegex, "Invalid loginCutoffTime format. Use HH:mm"),
    halfDayAfterTime: z
      .string()
      .regex(timeRegex, "Invalid halfDayAfterTime format. Use HH:mm"),
    absentAfterTime: z
      .string()
      .regex(timeRegex, "Invalid absentAfterTime format. Use HH:mm"),
    minimumWorkMinutes: z.number().min(0).default(480), // 8 hours
    overtimeEnabled: z.boolean().default(true),
    overtimeAfterMinutes: z.number().min(0).default(480),
    eodTriggerTime: z
      .string()
      .regex(timeRegex, "Invalid eodTriggerTime format. Use HH:mm"),
    breakDeductionEnabled: z.boolean().default(false),
    defaultBreakMinutes: z.number().min(0).default(45),
    isDefault: z.boolean().default(false),
  }),
});

export type CreateShiftPolicyInput = z.infer<
  typeof createShiftPolicySchema
>["body"];
