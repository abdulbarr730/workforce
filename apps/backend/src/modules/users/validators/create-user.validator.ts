import { z } from "zod";

import { UserRole } from "../../../_shared/constants";

export const createUserSchema = z.object({
  employeeId: z.string().optional(),

  name: z.string(),

  email: z.email(),

  // Optional: without it (or with sendLoginEmail) a one-time password is
  // made and emailed.
  password: z.string().min(6).optional(),

  departmentId: z.string().optional(),
  departmentName: z.string().optional(),
  departmentIds: z.array(z.string()).optional(),
  departmentNames: z.array(z.string()).optional(),

  // Built-in or custom role key; checked against AccessRole by the controller.
  role: z.string().trim().toUpperCase().default(UserRole.EMPLOYEE),

  isScreenshotTrackingEnabled: z.boolean().optional(),
  checkinIntervalMinutes: z.number().optional(),
  customCheckinTimes: z.array(z.string()).optional(),
  workingDays: z.array(z.string()).optional(),
  assignedShiftPolicyId: z.string().optional(),
  assignedShiftPolicyName: z.string().optional(),
});
