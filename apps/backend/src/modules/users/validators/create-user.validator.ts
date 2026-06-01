import { z } from "zod";

import { UserRole } from "../../../_shared/constants";

export const createUserSchema =
  z.object({
    employeeId: z.string(),

    name: z.string(),

    email: z.email(),

    password: z
      .string()
      .min(6),

    departmentId: z.string().optional(),
    departmentName: z.string().optional(),

    role: z.nativeEnum(
      UserRole
    )
  });