import { z } from "zod";

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  deviceId: z.string().optional(),
  deviceMeta: z
    .object({
      hostname: z.string().nullable().optional(),
      os: z.string().nullable().optional(),
      platform: z.string().nullable().optional(),
      agentVersion: z.string().nullable().optional(),
      hardwareFingerprint: z.string().nullable().optional(),
    })
    .optional(),
});
