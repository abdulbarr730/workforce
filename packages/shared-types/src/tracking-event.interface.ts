import { EventType } from "./event-types";

export interface TrackingEvent {
  eventId: string;

  employeeId: string;

  companyId: string;

  deviceId: string;

  sessionId: string;

  type: EventType;

  source: "DESKTOP_AGENT";

  timestamp: string;

  metadata: Record<string, unknown>;
}
