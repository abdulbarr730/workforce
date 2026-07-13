import { z } from "zod";

export const endSessionSchema = z.object({
  completedTasks: z.array(z.string()),

  pendingTasks: z.array(z.string()),

  blockers: z.string(),

  eodReport: z.string(),
});
