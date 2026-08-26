import { z } from "zod";

import { UserRole } from "../../../_shared/constants";

export const createUserSchema = z.object({
  employeeId: z.string().optional(),

  name: z.string(),

  email: z.email(),

  password: z.string().min(6),

  departmentId: z.string().optional(),
  departmentName: z.string().optional(),
  departmentIds: z.array(z.string()).optional(),
  departmentNames: z.array(z.string()).optional(),

  role: z.nativeEnum(UserRole),

  isScreenshotTrackingEnabled: z.boolean().optional(),
  checkinIntervalMinutes: z.number().optional(),
  customCheckinTimes: z.array(z.string()).optional(),
  workingDays: z.array(z.string()).optional(),
  assignedShiftPolicyId: z.string().optional(),
  assignedShiftPolicyName: z.string().optional(),
});
