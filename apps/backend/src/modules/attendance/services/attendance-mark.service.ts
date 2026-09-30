import { Request } from "express";
import {
  AttendanceMark,
  AttendanceMarkSettings,
  WorkLocation,
} from "../model/attendance-mark.model";
import { AttendanceRecord } from "../model/attendance-record.model";
import { getBusinessDayBounds } from "./shift-schedule.service";
import { recomputeAttendanceDates, todayKey } from "./request-rules.service";

export type MarkSettings = {
  markRequired: boolean;
  locationRequired: boolean;
  requiredFrom: string | null;
};

export async function getMarkSettings(): Promise<MarkSettings> {
  const doc: any = await AttendanceMarkSettings.findOne({ key: "default" }).lean();
  return {
    markRequired: doc?.markRequired === true,
    locationRequired: doc?.locationRequired === true,
    requiredFrom: doc?.requiredFrom || null,
  };
}

/** Whether a day's attendance comes only from Mark Attendance. */
export async function markRequiredFor(date: string) {
  const settings = await getMarkSettings();
  return Boolean(
    settings.markRequired && settings.requiredFrom && date >= settings.requiredFrom,
  );
}

/** The active work locations that apply to an employee. */
export async function locationsFor(employeeId: string) {
  return WorkLocation.find({
    isActive: true,
    $or: [{ appliesTo: "ALL" }, { appliesTo: "EMPLOYEES", employeeIds: employeeId }],
  }).lean();
}

/** The caller's public internet address (behind the reverse proxy). */
export const clientIp = (req: Request) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const raw = forwarded || req.socket?.remoteAddress || "";
  return raw.replace(/^::ffff:/, "");
};

const distanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

const normalizeWifi = (value: unknown) => String(value || "").trim().toLowerCase();

export type LocationReading = {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  wifiName?: string | null;
  publicIp?: string | null;
};

/**
 * Is the employee at one of their work locations? Any one proof is enough:
 * GPS within the radius (with some room for the reading's accuracy), the
 * office Wi-Fi, or the office internet address.
 */
export function matchLocation(reading: LocationReading, locations: any[]) {
  let nearest: { location: any; distance: number } | null = null;
  for (const location of locations) {
    const wifi = normalizeWifi(reading.wifiName);
    if (wifi && (location.wifiNames || []).some((w: string) => normalizeWifi(w) === wifi)) {
      return { matched: true, location, method: "WIFI", distance: null as number | null };
    }
    if (
      reading.publicIp &&
      (location.publicIps || []).some((ip: string) => String(ip).trim() === reading.publicIp)
    ) {
      return { matched: true, location, method: "IP", distance: null as number | null };
    }
    if (
      typeof reading.latitude === "number" &&
      typeof reading.longitude === "number" &&
      typeof location.latitude === "number" &&
      typeof location.longitude === "number"
    ) {
      const distance = distanceMeters(
        reading.latitude,
        reading.longitude,
        location.latitude,
        location.longitude,
      );
      const radius = Number(location.radiusMeters || 200);
      // Allow for the reading's inaccuracy, but never more than the radius.
      const slack = Math.min(Math.max(Number(reading.accuracyMeters || 0), 0), radius);
      if (distance <= radius + slack) {
        return { matched: true, location, method: "GPS", distance: Math.round(distance) };
      }
      if (!nearest || distance < nearest.distance) nearest = { location, distance };
    }
  }
  return {
    matched: false,
    location: nearest?.location || null,
    method: null as string | null,
    distance: nearest ? Math.round(nearest.distance) : null,
  };
}

/** The laptop-open time the agent reports, kept within today and not in the future. */
export function clampLaptopOpen(value: unknown, date: string) {
  const bounds = getBusinessDayBounds(date);
  const now = Date.now();
  const at = value ? new Date(String(value)) : null;
  if (!at || Number.isNaN(at.getTime())) return new Date(now);
  const time = Math.min(Math.max(at.getTime(), bounds.start.getTime()), now);
  return new Date(time);
}

/**
 * Puts a marked login on the day's attendance (as a set login time) and
 * recalculates the day. A login an admin already corrected by hand is kept.
 */
export async function applyMarkToAttendance(mark: any) {
  const record: any = await AttendanceRecord.findOne({
    employeeId: mark.employeeId,
    date: mark.date,
  }).lean();
  const adminCorrected = (record?.correctionHistory || []).some(
    (entry: any) =>
      entry.source === "ADMIN" &&
      (entry.changes || []).some((line: string) => line.startsWith("Login")),
  );
  if (!adminCorrected) {
    await AttendanceRecord.updateOne(
      { employeeId: mark.employeeId, date: mark.date },
      {
        $set: { loginTime: mark.loginTime, loginTimeOverridden: true },
        $setOnInsert: {
          employeeId: mark.employeeId,
          employeeName: mark.employeeName || undefined,
          date: mark.date,
          attendanceStatus: "PRESENT",
        },
      },
      { upsert: true },
    );
  }
  await recomputeAttendanceDates(mark.employeeId, [mark.date]);
}

export async function todaysMark(employeeId: string) {
  return AttendanceMark.findOne({ employeeId, date: todayKey() }).lean();
}
