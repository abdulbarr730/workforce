import { z } from "zod";

// Validate the shape of a single event coming from the desktop
export const singleEventSchema = z.object({
  eventId: z.string().min(1),
  employeeId: z.string().min(1),
  companyId: z.string().min(1),
  deviceId: z.string().min(1),
  sessionId: z.string().min(1),

  type: z.string().min(1),
  source: z.string().min(1),

  timestamp: z.string().datetime(),

  metadata: z.record(z.string(), z.any()).optional().default({}),
});

export const ingestEventsSchema = z.object({
  body: z.object({
    events: z
      .array(z.any())
      .min(1, "Payload must contain at least 1 event")
      .max(2000, "Payload exceeds maximum batch size of 2000 events"),
  }),
});

export type IngestEventsInput = z.infer<typeof ingestEventsSchema>["body"];
