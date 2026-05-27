import { z } from "zod";

// Validate the shape of a single event coming from the desktop
const singleEventSchema = z.object({
  eventId: z.string().min(1),
  employeeId: z.string().min(1),
  companyId: z.string().min(1),
  deviceId: z.string().min(1),
  sessionId: z.string().min(1),
  
  // Emergency Bypass: Accept string to ignore the broken monorepo package link
  type: z.string().min(1),
  source: z.string().min(1),
  
  timestamp: z.string().datetime(), // Enforce strict ISO string dates
  
  // FIXED: Zod v4 requires explicit key and value types
  metadata: z.record(z.string(), z.any()).optional().default({}),
});

// The actual payload schema: An array of events, capped at 1000
export const ingestEventsSchema = z.object({
  body: z.object({
    events: z.array(singleEventSchema)
      .min(1, "Payload must contain at least 1 event")
      .max(1000, "Payload exceeds maximum batch size of 1000 events"),
  })
});

export type IngestEventsInput = z.infer<typeof ingestEventsSchema>["body"];