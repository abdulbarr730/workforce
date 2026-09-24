import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Device } from "../model/device.model";
import { User } from "../../users/model/user.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { UserRole } from "../../../_shared/constants";
import { MicroCache } from "../../../shared/utils/micro-cache";
import { mapWithConcurrency } from "../../../shared/utils/concurrency";

// The device inventory is polled by several admin pages; share one build.
const DEVICES_CACHE_TTL_MS = 20_000;
const devicesCache = new MicroCache<unknown>(DEVICES_CACHE_TTL_MS, 5);

export const invalidateDevicesCache = () => devicesCache.invalidate();

// Latest event per device within the inventory window. Uses the
// { deviceId, createdAt, timestamp } index: one short index walk per known
// device instead of sorting 45 days of telemetry on every request.
const findLatestEventsByDevice = async (employeeIds: string[], since: Date) => {
  const deviceIds = (await ActivityEvent.distinct("deviceId")).filter(
    (deviceId): deviceId is string =>
      typeof deviceId === "string" && deviceId !== "",
  );
  const latest = await mapWithConcurrency(deviceIds, 8, (deviceId) =>
    ActivityEvent.findOne({
      deviceId,
      employeeId: { $in: employeeIds },
      createdAt: { $gte: since },
      invalidated: { $ne: true },
    })
      .select("deviceId employeeId createdAt timestamp type metadata")
      .sort({ createdAt: -1, timestamp: -1 })
      .lean(),
  );
  return latest
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .map((event: any) => ({
      _id: event.deviceId,
      employeeId: event.employeeId,
      lastReceivedAt: event.createdAt,
      lastEventAt: event.timestamp,
      lastEventType: event.type,
      metadata: event.metadata,
    }));
};

export const listDevicesController = asyncHandler(
  async (_req: Request, res: Response) => {
    const enriched = await devicesCache.getOrCompute("all", buildDeviceList);
    res.json(successResponse(enriched, "Devices fetched"));
  },
);

const buildDeviceList = async () => {
  const onlineCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const inventoryCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const [employees, devices] = await Promise.all([
    User.find({
      isActive: true,
      deletedAt: null,
      role: { $nin: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
    })
      .sort({ employeeId: 1 })
      .lean(),
    Device.find({
      pendingAction: { $ne: "UNINSTALL" },
    })
      .sort({ lastSeenAt: -1 })
      .lean(),
  ]);
  const activeEmployeeIds = new Set(employees.map((user) => user.employeeId));
  const latestEvents = await ActivityEvent.aggregate([
    {
      $match: {
        deviceId: { $type: "string", $ne: "" },
        employeeId: { $in: [...activeEmployeeIds] },
        createdAt: { $gte: onlineCutoff },
        invalidated: { $ne: true },
      },
    },
    { $sort: { createdAt: -1, timestamp: -1 } },
    {
      $group: {
        _id: "$deviceId",
        employeeId: { $first: "$employeeId" },
        lastReceivedAt: { $first: "$createdAt" },
        lastEventAt: { $first: "$timestamp" },
        lastEventType: { $first: "$type" },
        metadata: { $first: "$metadata" },
      },
    },
  ]);
  const latestAnyEvents = await findLatestEventsByDevice(
    [...activeEmployeeIds],
    inventoryCutoff,
  );
  const latestEventByDevice = new Map<string, any>(
    latestEvents.map((event) => [String(event._id), event]),
  );
  const latestAnyEventByDevice = new Map<string, any>(
    latestAnyEvents.map((event) => [String(event._id), event]),
  );

  const deviceById = new Map<string, any>(
    devices
      .filter((device) => device.deviceId)
      .map((device) => [String(device.deviceId), device]),
  );

  const validIdleTimeout = (value: unknown) => {
    const minutes = Number(value);
    return Number.isFinite(minutes) && minutes >= 1 && minutes <= 120
      ? Math.round(minutes)
      : null;
  };
  const deviceConfigRecency = (device: any) =>
    Math.max(
      device?.updatedAt ? new Date(device.updatedAt).getTime() : 0,
      device?.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0,
      device?.createdAt ? new Date(device.createdAt).getTime() : 0,
    );
  const idleTimeoutByEmployee = new Map<string, number>();
  [...devices]
    .filter((device) =>
      device.employeeId ? activeEmployeeIds.has(device.employeeId) : false,
    )
    .sort((a, b) => deviceConfigRecency(b) - deviceConfigRecency(a))
    .forEach((device) => {
      const employeeId = String(device.employeeId || "");
      const timeout = validIdleTimeout(device.idleTimeoutMinutes);
      if (
        employeeId &&
        timeout !== null &&
        !idleTimeoutByEmployee.has(employeeId)
      ) {
        idleTimeoutByEmployee.set(employeeId, timeout);
      }
    });
  const resolveIdleTimeout = (
    deviceId: unknown,
    employeeId: unknown,
    fallback?: unknown,
  ) => {
    const exact = deviceById.get(String(deviceId || ""));
    const exactTimeout = validIdleTimeout(exact?.idleTimeoutMinutes);
    if (exactTimeout !== null) return exactTimeout;

    const employeeTimeout = idleTimeoutByEmployee.get(String(employeeId || ""));
    if (employeeTimeout !== undefined) return employeeTimeout;

    const fallbackTimeout = validIdleTimeout(fallback);
    return fallbackTimeout ?? 10;
  };

  const candidates = [
    ...devices
      .filter((device) =>
        device.employeeId ? activeEmployeeIds.has(device.employeeId) : false,
      )
      .map((device) => ({
        ...device,
        idleTimeoutMinutes: resolveIdleTimeout(
          device.deviceId,
          device.employeeId,
          device.idleTimeoutMinutes,
        ),
      })),
    ...latestAnyEvents
      .filter((event) => event._id && activeEmployeeIds.has(event.employeeId))
      .map((event) => ({
        ...(deviceById.get(String(event._id)) || {}),
        _id: deviceById.get(String(event._id))?._id || `telemetry-${event._id}`,
        deviceId: String(event._id),
        hardwareFingerprint:
          event.metadata?.hardwareFingerprint ??
          deviceById.get(String(event._id))?.hardwareFingerprint ??
          null,
        hostname:
          event.metadata?.hostname ??
          deviceById.get(String(event._id))?.hostname ??
          "Unknown",
        os: event.metadata?.os ?? deviceById.get(String(event._id))?.os ?? null,
        platform:
          event.metadata?.platform ??
          deviceById.get(String(event._id))?.platform ??
          null,
        agentVersion:
          event.metadata?.agentVersion ??
          deviceById.get(String(event._id))?.agentVersion ??
          null,
        employeeId: event.employeeId ?? null,
        assignedAt: deviceById.get(String(event._id))?.assignedAt ?? null,
        lastSeenAt: event.lastReceivedAt,
        lastEventType: event.lastEventType ?? null,
        lastIp: deviceById.get(String(event._id))?.lastIp ?? null,
        isActive: true,
        isPlaceholder: false,
        idleTimeoutMinutes: resolveIdleTimeout(
          event._id,
          event.employeeId,
          deviceById.get(String(event._id))?.idleTimeoutMinutes,
        ),
        pendingAction: deviceById.get(String(event._id))?.pendingAction ?? null,
        createdAt:
          deviceById.get(String(event._id))?.createdAt ?? event.lastReceivedAt,
        updatedAt: event.lastReceivedAt,
      })),
  ];

  const bestDeviceByEmployee = new Map<string, any>();
  candidates.forEach((device: any) => {
    const employeeId = String(device.employeeId || "");
    if (!employeeId || !activeEmployeeIds.has(employeeId)) return;
    const latestEvent = latestEventByDevice.get(device.deviceId);
    const latestAnyEvent = latestAnyEventByDevice.get(device.deviceId);
    const candidate = {
      ...device,
      lastSeenAt: latestEvent?.lastReceivedAt || device.lastSeenAt,
      displayLastSeenAt:
        latestAnyEvent?.lastReceivedAt ||
        latestEvent?.lastReceivedAt ||
        device.lastSeenAt,
      lastEventAt: latestAnyEvent?.lastEventAt || device.lastSeenAt,
      lastEventType:
        latestAnyEvent?.lastEventType ||
        latestEvent?.lastEventType ||
        device.lastEventType,
      idleTimeoutMinutes: resolveIdleTimeout(
        device.deviceId,
        employeeId,
        device.idleTimeoutMinutes,
      ),
      hostname: latestAnyEvent?.metadata?.hostname || device.hostname,
      os: latestAnyEvent?.metadata?.os || device.os,
      platform: latestAnyEvent?.metadata?.platform || device.platform,
      agentVersion:
        latestAnyEvent?.metadata?.agentVersion || device.agentVersion,
      hardwareFingerprint:
        latestAnyEvent?.metadata?.hardwareFingerprint ||
        device.hardwareFingerprint,
    };
    const existing = bestDeviceByEmployee.get(employeeId);
    const existingSeen = existing?.displayLastSeenAt
      ? new Date(existing.displayLastSeenAt).getTime()
      : 0;
    const candidateSeen = candidate.displayLastSeenAt
      ? new Date(candidate.displayLastSeenAt).getTime()
      : 0;
    const existingOnline = existingSeen >= onlineCutoff.getTime();
    const candidateOnline = candidateSeen >= onlineCutoff.getTime();
    if (
      !existing ||
      (candidateOnline && !existingOnline) ||
      candidateSeen > existingSeen
    ) {
      bestDeviceByEmployee.set(employeeId, candidate);
    }
  });

  const shiftIds = employees
    .map((u) => u.assignedShiftPolicyId)
    .filter(Boolean) as string[];
  const shifts = shiftIds.length
    ? await ShiftPolicy.find({ _id: { $in: shiftIds } }).lean()
    : [];
  const shiftById = new Map(shifts.map((s) => [String(s._id), s]));

  const enriched = employees.map((user) => {
    const d =
      bestDeviceByEmployee.get(user.employeeId) ||
      ({
        _id: `employee-${user.employeeId}`,
        deviceId: `not-reported:${user.employeeId}`,
        hostname: null,
        os: null,
        platform: null,
        agentVersion: null,
        employeeId: user.employeeId,
        assignedAt: null,
        lastSeenAt: null,
        displayLastSeenAt: null,
        lastEventAt: null,
        lastEventType: null,
        lastIp: null,
        isActive: false,
        isPlaceholder: true,
        idleTimeoutMinutes: idleTimeoutByEmployee.get(user.employeeId) ?? 10,
        pendingAction: null,
      } as any);
    const shift = user?.assignedShiftPolicyId
      ? shiftById.get(String(user.assignedShiftPolicyId))
      : null;
    return {
      ...d,
      lastSeenAt: d.lastSeenAt ?? null,
      displayLastSeenAt: d.displayLastSeenAt ?? d.lastSeenAt ?? null,
      lastEventAt: d.lastEventAt ?? d.lastSeenAt ?? null,
      lastEventType: d.lastEventType ?? null,
      employee: user
        ? {
            employeeId: user.employeeId,
            name: user.name,
            email: user.email,
            role: user.role,
            departmentName: user.departmentName,
          }
        : null,
      shiftPolicy: shift
        ? {
            id: String(shift._id),
            name: (shift as any).name,
            shiftStart: (shift as any).shiftStartTime ?? null,
            shiftEnd: (shift as any).shiftEndTime ?? null,
            workingDays: (shift as any).activeDays ?? [],
          }
        : null,
    };
  });

  return enriched;
};
