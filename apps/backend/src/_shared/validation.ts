import { z } from "zod";
import { EventSource, EventType } from "./types";

export const baseEventSchema = z.object({
  eventId: z.string(),
  employeeId: z.string(),
  companyId: z.string(),
  deviceId: z.string(),
  sessionId: z.string(),
  type: z.nativeEnum(EventType),
  source: z.nativeEnum(EventSource),
  timestamp: z.coerce.date(),
  metadata: z.record(z.string(), z.any()),
  invalidated: z.boolean().optional(),
  createdAt: z.coerce.date().optional(),
});
