import { Device } from "../model/device.model";

type EventLike = {
  deviceId: string;
  employeeId?: string;
  type?: string;
  timestamp?: Date | string;
  metadata?: Record<string, any>;
};

export const upsertDeviceFromEvent = async (event: EventLike, ip?: string) => {
  if (!event?.deviceId) return null;

  const meta = event.metadata || {};
  const ts = event.timestamp ? new Date(event.timestamp) : new Date();

  const update: Record<string, any> = {
    lastSeenAt: ts,
    lastEventType: event.type ?? null,
  };

  if (meta.hostname) update.hostname = meta.hostname;
  if (meta.os) update.os = meta.os;
  if (meta.platform) update.platform = meta.platform;
  if (meta.agentVersion) update.agentVersion = meta.agentVersion;
  if (ip) update.lastIp = ip;

  const setOnInsert: Record<string, any> = { deviceId: event.deviceId };
  if (event.employeeId) {
    setOnInsert.employeeId = event.employeeId;
    setOnInsert.assignedAt = new Date();
  }

  return Device.findOneAndUpdate(
    { deviceId: event.deviceId },
    { $set: update, $setOnInsert: setOnInsert },
    { upsert: true, returnDocument: "after" },
  );
};
