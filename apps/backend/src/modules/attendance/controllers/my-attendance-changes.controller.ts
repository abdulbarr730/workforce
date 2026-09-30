import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AttendanceRecord } from "../model/attendance-record.model";
import { todayKey } from "../services/request-rules.service";
import { bySuperAdmin, getSuperAdmins } from "../../../shared/utils/super-admin";

const DAYS_BACK = 120;

/**
 * Employee: every change made to their attendance, newest first. Admin
 * changes they did not request are flagged (and "unseen" until acknowledged).
 */
export const getMyAttendanceChangesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const since = new Date(`${todayKey()}T12:00:00Z`);
    since.setUTCDate(since.getUTCDate() - DAYS_BACK);
    const records = await AttendanceRecord.find({
      employeeId,
      date: { $gte: since.toISOString().slice(0, 10) },
      "correctionHistory.0": { $exists: true },
    })
      .select("date attendanceStatus correctionHistory")
      .lean();
    const admins = await getSuperAdmins();
    const changes = (records as any[])
      .flatMap((record) =>
        (record.correctionHistory || [])
          .filter(
            (entry: any) =>
              !bySuperAdmin(admins, {
                role: entry.correctedByRole,
                employeeId: entry.correctedBy,
              }),
          )
          .map((entry: any) => ({
            id: String(entry._id),
            date: record.date,
            at: entry.correctedAt,
            source: entry.source || "ADMIN",
            requestId: entry.requestId || null,
            byName: entry.correctedByName || "Admin",
            reason: entry.reason,
            changes: entry.changes || [],
            seen: Boolean(entry.seenAt) || entry.source === "REQUEST",
          })),
      )
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    res.json(
      successResponse(
        { changes, unseen: changes.filter((c) => !c.seen).length },
        "My attendance changes",
      ),
    );
  },
);

/** Employee: "Got it" on the admin-change messages. */
export const markMyAttendanceChangesSeenController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    await AttendanceRecord.updateMany(
      { employeeId, correctionHistory: { $elemMatch: { seenAt: null } } },
      { $set: { "correctionHistory.$[entry].seenAt": new Date() } },
      { arrayFilters: [{ "entry.seenAt": null }] },
    );
    res.json(successResponse(null, "Marked as seen"));
  },
);
