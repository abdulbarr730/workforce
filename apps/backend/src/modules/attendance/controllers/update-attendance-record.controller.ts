import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AttendanceRecord } from "../model/attendance-record.model";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { WorkSession } from "../../work-sessions/model/work-session.model";
import { getBusinessDayBounds } from "../services/shift-schedule.service";

export const updateAttendanceRecordController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      attendanceStatus,
      loginTime,
      logoutTime,
      productiveMinutes,
      breakMinutes,
      idleMinutes,
      awayWorkingMinutes,
      lateMinutes,
      overtimeMinutes,
      correctionReason,
    } = req.body;

    if (req.user?.role !== "SUPER_ADMIN") {
      res
        .status(403)
        .json(errorResponse("Only Super Admin can edit attendance records"));
      return;
    }

    const reason = String(correctionReason || "").trim();
    if (reason.length < 5) {
      res
        .status(400)
        .json(errorResponse("Correction reason is required"));
      return;
    }

    const record = await AttendanceRecord.findById(id);

    if (!record) {
      res.status(404).json(errorResponse("Attendance record not found"));
      return;
    }

    const beforeCorrection = {
      attendanceStatus: record.attendanceStatus,
      loginTime: record.loginTime,
      logoutTime: record.logoutTime,
      productiveMinutes: record.productiveMinutes,
      breakMinutes: record.breakMinutes,
      idleMinutes: record.idleMinutes,
      awayWorkingMinutes: record.awayWorkingMinutes,
      lateMinutes: record.lateMinutes,
      overtimeMinutes: record.overtimeMinutes,
      totalWorkedMinutes: record.totalWorkedMinutes,
    };

    if (attendanceStatus !== undefined)
      record.attendanceStatus = attendanceStatus;
    if (loginTime !== undefined) {
      record.loginTime = loginTime ? new Date(loginTime) : null;
      record.loginTimeOverridden = true;
    }
    if (logoutTime !== undefined) {
      record.logoutTime = logoutTime ? new Date(logoutTime) : null;
      record.logoutTimeOverridden = true;
    }
    if (productiveMinutes !== undefined)
      record.productiveMinutes = Number(productiveMinutes);
    if (breakMinutes !== undefined) record.breakMinutes = Number(breakMinutes);
    if (idleMinutes !== undefined) record.idleMinutes = Number(idleMinutes);
    if (awayWorkingMinutes !== undefined)
      record.awayWorkingMinutes = Number(awayWorkingMinutes);
    if (lateMinutes !== undefined) record.lateMinutes = Number(lateMinutes);
    if (overtimeMinutes !== undefined)
      record.overtimeMinutes = Number(overtimeMinutes);

    if (productiveMinutes !== undefined || awayWorkingMinutes !== undefined) {
      record.totalWorkedMinutes = Number(
        (
          Number(record.productiveMinutes || 0) +
          Number(record.awayWorkingMinutes || 0)
        ).toFixed(2),
      );
    }
    record.lastModifiedBy = req.user?.employeeId || null;

    const afterCorrection = {
      attendanceStatus: record.attendanceStatus,
      loginTime: record.loginTime,
      logoutTime: record.logoutTime,
      productiveMinutes: record.productiveMinutes,
      breakMinutes: record.breakMinutes,
      idleMinutes: record.idleMinutes,
      awayWorkingMinutes: record.awayWorkingMinutes,
      lateMinutes: record.lateMinutes,
      overtimeMinutes: record.overtimeMinutes,
      totalWorkedMinutes: record.totalWorkedMinutes,
    };

    (record as any).correctionHistory = [
      ...((record as any).correctionHistory || []),
      {
        correctedAt: new Date(),
        correctedBy: req.user?.employeeId || "SUPER_ADMIN",
        correctedByName: req.user?.name || "",
        reason,
        before: beforeCorrection,
        after: afterCorrection,
      },
    ];

    // Self-healing for corrupted/legacy records missing employeeName
    if (!record.employeeName && record.employeeId) {
      const user = await User.findOne({ employeeId: record.employeeId });
      if (user) {
        record.employeeName = user.name;
      } else {
        // Fallback if user is somehow deleted
        record.employeeName = "Unknown Employee";
      }
    }

    await record.save();

    // Keep the underlying work-session timeline consistent so every screen
    // and later attendance regeneration sees the administrator's correction.
    const bounds = getBusinessDayBounds(record.date);
    const sessions = await WorkSession.find({
      employeeId: record.employeeId,
      loginAt: { $gte: bounds.start, $lte: bounds.end },
    }).sort({ loginAt: 1 });
    if (loginTime !== undefined && sessions[0] && record.loginTime) {
      sessions[0].loginAt = record.loginTime;
      await sessions[0].save();
    }
    if (logoutTime !== undefined && sessions.length > 0) {
      const lastSession = sessions[sessions.length - 1];
      lastSession.logoutAt = record.logoutTime || null;
      lastSession.status = record.logoutTime ? "COMPLETED" : "ACTIVE";
      await lastSession.save();
    }

    res
      .status(200)
      .json(successResponse(record, "Attendance record updated successfully"));
  },
);
