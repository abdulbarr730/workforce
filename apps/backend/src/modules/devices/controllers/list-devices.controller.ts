import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Device } from "../model/device.model";
import { User } from "../../users/model/user.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";

export const listDevicesController = asyncHandler(
  async (_req: Request, res: Response) => {
    const onlineCutoff = new Date(Date.now() - 5 * 60 * 1000);
    const devices = await Device.find({
      pendingAction: { $ne: "UNINSTALL" },
    })
      .sort({ lastSeenAt: -1 })
      .lean();
    const latestEvents = await ActivityEvent.aggregate([
      {
        $match: {
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
    const latestAnyEvents = await ActivityEvent.aggregate([
      {
        $match: {
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
    const latestEventByDevice = new Map(
      latestEvents.map((event) => [event._id, event]),
    );
    const latestAnyEventByDevice = new Map(
      latestAnyEvents.map((event) => [event._id, event]),
    );
    const deviceIds = new Set(devices.map((d) => d.deviceId).filter(Boolean));
    const telemetryOnlyDevices = latestEvents
      .filter((event) => event._id && !deviceIds.has(event._id))
      .map((event) => ({
        _id: `telemetry-${event._id}`,
        deviceId: event._id,
        hardwareFingerprint: event.metadata?.hardwareFingerprint ?? null,
        hostname: event.metadata?.hostname ?? "Unknown",
        os: event.metadata?.os ?? null,
        platform: event.metadata?.platform ?? null,
        agentVersion: event.metadata?.agentVersion ?? null,
        employeeId: event.employeeId ?? null,
        assignedAt: null,
        lastSeenAt: event.lastEventAt,
        lastEventType: event.lastEventType ?? null,
        lastIp: null,
        isActive: true,
        idleTimeoutMinutes: 10,
        pendingAction: null,
        createdAt: event.lastReceivedAt,
        updatedAt: event.lastReceivedAt,
      }));
    const mergedByPhysicalKey = new Map<string, any>();
    [...devices, ...telemetryOnlyDevices].forEach((device: any) => {
      const key =
        device.hardwareFingerprint ||
        [
          device.employeeId || "",
          String(device.hostname || "").toLowerCase(),
          String(device.platform || "").toLowerCase(),
        ].join("|");
      const existing = mergedByPhysicalKey.get(key);
      if (!existing) {
        mergedByPhysicalKey.set(key, device);
        return;
      }
      const existingSeen = existing.lastSeenAt
        ? new Date(existing.lastSeenAt).getTime()
        : 0;
      const deviceSeen = device.lastSeenAt
        ? new Date(device.lastSeenAt).getTime()
        : 0;
      // Prefer persisted Device records over telemetry-only placeholders unless
      // the telemetry row is newer; this prevents one laptop appearing twice.
      const existingIsTelemetry = String(existing._id).startsWith("telemetry-");
      const deviceIsTelemetry = String(device._id).startsWith("telemetry-");
      if (deviceSeen > existingSeen || (existingIsTelemetry && !deviceIsTelemetry)) {
        mergedByPhysicalKey.set(
          key,
          !existingIsTelemetry && deviceIsTelemetry
            ? {
                ...existing,
                lastSeenAt: device.lastSeenAt,
                lastEventType: device.lastEventType,
                agentVersion: device.agentVersion || existing.agentVersion,
                hardwareFingerprint:
                  device.hardwareFingerprint || existing.hardwareFingerprint,
              }
            : { ...existing, ...device },
        );
      }
    });
    const allDevices = Array.from(mergedByPhysicalKey.values());

    const empIds = allDevices
      .map((d) => d.employeeId)
      .filter(Boolean) as string[];
    const users = empIds.length
      ? await User.find({ employeeId: { $in: empIds } }).lean()
      : [];
    const userByEmp = new Map(users.map((u) => [u.employeeId, u]));

    const shiftIds = users
      .map((u) => u.assignedShiftPolicyId)
      .filter(Boolean) as string[];
    const shifts = shiftIds.length
      ? await ShiftPolicy.find({ _id: { $in: shiftIds } }).lean()
      : [];
    const shiftById = new Map(shifts.map((s) => [String(s._id), s]));

    const enriched = allDevices.map((d) => {
      const latestEvent = latestEventByDevice.get(d.deviceId);
      const latestAnyEvent = latestAnyEventByDevice.get(d.deviceId);
      const recentServerSeenAt = latestEvent?.lastReceivedAt || null;
      const lastSeenAt = recentServerSeenAt || d.lastSeenAt;
      const displayLastSeenAt =
        latestAnyEvent?.lastReceivedAt &&
        (!lastSeenAt ||
          new Date(latestAnyEvent.lastReceivedAt).getTime() >
            new Date(lastSeenAt).getTime())
          ? latestAnyEvent.lastReceivedAt
          : lastSeenAt;
      const user = d.employeeId ? userByEmp.get(d.employeeId) : null;
      const shift = user?.assignedShiftPolicyId
        ? shiftById.get(String(user.assignedShiftPolicyId))
        : null;
      return {
        ...d,
        lastSeenAt,
        displayLastSeenAt,
        lastEventAt: latestAnyEvent?.lastEventAt ?? lastSeenAt,
        lastEventType:
          latestAnyEvent?.lastEventType ??
          latestEvent?.lastEventType ??
          d.lastEventType,
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

    res.json(successResponse(enriched, "Devices fetched"));
  },
);
