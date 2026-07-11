import crypto from "crypto";

import { EventType } from "@workforce/shared-types";
import type { TrackingEvent } from "@workforce/shared-types";

import { authStore } from "../store/auth.store";

import { getDeviceId, getDeviceMeta } from "./device-info";

import { trackingState } from "./tracking-state";

export function createTrackingEvent(
  type: EventType,

  metadata: Record<string, any> = {},
): TrackingEvent {
  const user = authStore.get("user") as any;

  return {
    eventId: crypto.randomUUID(),

    employeeId: user?.employeeId || "UNKNOWN_EMPLOYEE",

    companyId: "PROSYNC_INFOTECH_PVT_LTD",

    deviceId: getDeviceId(),

    sessionId: trackingState.sessionId,

    type,

    source: "DESKTOP_AGENT",

    timestamp: new Date().toISOString(),

    metadata: {
      ...getDeviceMeta(),

      ...metadata,
    },
  };
}
