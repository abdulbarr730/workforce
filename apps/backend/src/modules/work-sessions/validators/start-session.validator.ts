import { z } from "zod";

export const startSessionSchema = z.object({
  todoList: z.array(z.string()),
});
