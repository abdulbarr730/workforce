import { EventSource } from "./event-source";

import { EventType } from "./event-types";

export interface BaseEvent {
  eventId: string;

  employeeId: string;

  companyId: string;

  deviceId: string;

  sessionId: string;

  type: EventType;

  source: EventSource;

  timestamp: Date;

  metadata: Record<string, any>;

  invalidated: boolean;

  createdAt: Date;
}
