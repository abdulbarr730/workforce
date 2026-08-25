import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Device } from "../model/device.model";
import { User } from "../../users/model/user.model";
import { ShiftPolicy } from "../../attendance/model/shift-policy.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";

export const listDevicesController = asyncHandler(
  async (_req: Request, res: Response) => {
    const devices = await Device.find().sort({ lastSeenAt: -1 }).lean();
    const deviceIds = devices.map((d) => d.deviceId).filter(Boolean);
    const latestEvents = deviceIds.length
      ? await ActivityEvent.aggregate([
          { $match: { deviceId: { $in: deviceIds } } },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: "$deviceId",
              lastReceivedAt: { $first: "$createdAt" },
              lastEventAt: { $first: "$timestamp" },
              lastEventType: { $first: "$type" },
            },
          },
        ])
      : [];
    const latestEventByDevice = new Map(
      latestEvents.map((event) => [event._id, event]),
    );

    const empIds = devices.map((d) => d.employeeId).filter(Boolean) as string[];
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

    const enriched = devices.map((d) => {
      const latestEvent = latestEventByDevice.get(d.deviceId);
      const lastSeenAt =
        latestEvent?.lastReceivedAt &&
        (!d.lastSeenAt ||
          new Date(latestEvent.lastReceivedAt).getTime() >
            new Date(d.lastSeenAt).getTime())
          ? latestEvent.lastReceivedAt
          : d.lastSeenAt;
      const user = d.employeeId ? userByEmp.get(d.employeeId) : null;
      const shift = user?.assignedShiftPolicyId
        ? shiftById.get(String(user.assignedShiftPolicyId))
        : null;
      return {
        ...d,
        lastSeenAt,
        lastEventType: latestEvent?.lastEventType ?? d.lastEventType,
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
