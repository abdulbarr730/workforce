export enum EventSource {
  DESKTOP_AGENT = "DESKTOP_AGENT",
  WEB_APP = "WEB_APP",
  MOBILE_APP = "MOBILE_APP",
  SYSTEM = "SYSTEM",
}

export enum EventType {
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  SESSION_START = "SESSION_START",
  SESSION_END = "SESSION_END",
  HEARTBEAT = "HEARTBEAT",
  ACTIVE_WINDOW = "ACTIVE_WINDOW",
  IDLE_START = "IDLE_START",
  IDLE_END = "IDLE_END",
  IDLE_POPUP_SHOWN = "IDLE_POPUP_SHOWN",
  IDLE_RESPONSE = "IDLE_RESPONSE",
  BREAK_START = "BREAK_START",
  BREAK_END = "BREAK_END",
  AWAY_WORK_START = "AWAY_WORK_START",
  AWAY_WORK_END = "AWAY_WORK_END",
  SYSTEM_SLEEP = "SYSTEM_SLEEP",
  SYSTEM_WAKE = "SYSTEM_WAKE",
  AUTO_SESSION_CLOSE = "AUTO_SESSION_CLOSE",
  AGENT_ONLINE = "AGENT_ONLINE",
  AGENT_OFFLINE = "AGENT_OFFLINE",
  AGENT_ERROR = "AGENT_ERROR",
}

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
