import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Device } from "../model/device.model";
import { User } from "../../users/model/user.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { UserRole } from "../../../_shared/constants";

export const listDevicesController = asyncHandler(
  async (_req: Request, res: Response) => {
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
    const latestAnyEvents = await ActivityEvent.aggregate([
      {
        $match: {
          deviceId: { $type: "string", $ne: "" },
          employeeId: { $in: [...activeEmployeeIds] },
          createdAt: { $gte: inventoryCutoff },
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
    const candidates = [
      ...devices.filter((device) =>
        device.employeeId ? activeEmployeeIds.has(device.employeeId) : false,
      ),
      ...latestAnyEvents
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
          lastSeenAt: event.lastReceivedAt,
          lastEventType: event.lastEventType ?? null,
          lastIp: null,
          isActive: true,
          idleTimeoutMinutes: 10,
          pendingAction: null,
          createdAt: event.lastReceivedAt,
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
          latestAnyEvent?.lastReceivedAt || latestEvent?.lastReceivedAt || device.lastSeenAt,
        lastEventAt: latestAnyEvent?.lastEventAt || device.lastSeenAt,
        lastEventType:
          latestAnyEvent?.lastEventType || latestEvent?.lastEventType || device.lastEventType,
        hostname: latestAnyEvent?.metadata?.hostname || device.hostname,
        os: latestAnyEvent?.metadata?.os || device.os,
        platform: latestAnyEvent?.metadata?.platform || device.platform,
        agentVersion: latestAnyEvent?.metadata?.agentVersion || device.agentVersion,
        hardwareFingerprint:
          latestAnyEvent?.metadata?.hardwareFingerprint || device.hardwareFingerprint,
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
        bestDeviceByEmployee.get(user.employeeId) || ({
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
          idleTimeoutMinutes: 10,
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

    res.json(successResponse(enriched, "Devices fetched"));
  },
);
