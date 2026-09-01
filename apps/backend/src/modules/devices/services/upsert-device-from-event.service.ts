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
  const eventTimestamp = event.timestamp ? new Date(event.timestamp) : null;
  const now = new Date();
  const eventTime = eventTimestamp?.getTime();
  const hasFreshEventTimestamp =
    !eventTime || Math.abs(now.getTime() - eventTime) <= 5 * 60 * 1000;

  const update: Record<string, any> = {
    lastEventType: event.type ?? null,
  };
  if (event.type === "LOGIN") {
    update.pendingAction = null;
  }
  if (hasFreshEventTimestamp) {
    update.lastSeenAt = now;
  }

  if (
    event.employeeId &&
    event.employeeId !== "UNKNOWN_EMPLOYEE" &&
    event.employeeId !== "CRM"
  ) {
    update.employeeId = event.employeeId;
    update.assignedAt = new Date();
  }

  if (meta.hostname) update.hostname = meta.hostname;
  if (meta.os) update.os = meta.os;
  if (meta.platform) update.platform = meta.platform;
  if (meta.agentVersion) update.agentVersion = meta.agentVersion;
  if (meta.hardwareFingerprint)
    update.hardwareFingerprint = meta.hardwareFingerprint;
  if (ip) update.lastIp = ip;

  const setOnInsert: Record<string, any> = {};
  if (event.employeeId) {
    setOnInsert.employeeId = event.employeeId;
    setOnInsert.assignedAt = new Date();
  }

  let existing = meta.hardwareFingerprint
    ? await Device.findOne({
        hardwareFingerprint: meta.hardwareFingerprint,
      })
    : null;

  // One-time migration for agents that previously used changing hostnames as
  // device IDs. Reuse the latest matching physical machine record.
  if (!existing && event.employeeId && meta.hostname && meta.platform) {
    existing = await Device.findOne({
      employeeId: event.employeeId,
      hostname: meta.hostname,
      platform: meta.platform,
    }).sort({ lastSeenAt: -1 });
  }

  if (existing) {
    if (
      existing.pendingAction === "SIGNOUT" &&
      existing.deviceId === event.deviceId &&
      event.type !== "LOGIN"
    ) {
      return existing;
    }

    await Device.deleteMany({
      _id: { $ne: existing._id },
      deviceId: event.deviceId,
    });
  }

  const saved = await Device.findOneAndUpdate(
    existing ? { _id: existing._id } : { deviceId: event.deviceId },
    {
      $set: { ...update, deviceId: event.deviceId },
      $setOnInsert: setOnInsert,
    },
    { upsert: true, returnDocument: "after" },
  );

  if (saved && event.employeeId && meta.hostname && meta.platform) {
    await Device.deleteMany({
      _id: { $ne: saved._id },
      employeeId: event.employeeId,
      hostname: meta.hostname,
      platform: meta.platform,
      pendingAction: { $ne: "SIGNOUT" },
    });
  }

  return saved;
};
