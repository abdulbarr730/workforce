import { z } from "zod";

import { UserRole } from "@workforce/shared-constants";

export const createUserSchema =
  z.object({
    employeeId: z.string(),

    name: z.string(),

    email: z.email(),

    password: z
      .string()
      .min(6),

    role: z.nativeEnum(
      UserRole
    )
  });