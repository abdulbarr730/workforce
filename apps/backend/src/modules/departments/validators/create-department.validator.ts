import { z } from "zod";

export const createDepartmentSchema = z.object({
  name: z.string(),

  description: z.string().optional(),

  managerId: z.string().optional(),

  managerName: z.string().optional(),
});
