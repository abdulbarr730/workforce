import { z } from "zod";

export const createRuleSchema = z.object({
  scopeType: z.enum(["GLOBAL", "DEPARTMENT", "ROLE", "EMPLOYEE"]),

  scopeId: z.string().nullable(),

  appName: z.string(),

  titlePattern: z.string().nullable(),

  productivityCategory: z.enum(["PRODUCTIVE", "UNPRODUCTIVE", "NEUTRAL"]),

  productivityScore: z.number().min(0).max(1),

  allowanceMinutes: z.number().min(0).optional(),
});
