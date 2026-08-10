import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AttendanceRecord } from "../model/attendance-record.model";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";

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
    } = req.body;

    const record = await AttendanceRecord.findById(id);

    if (!record) {
      res.status(404).json(errorResponse("Attendance record not found"));
      return;
    }

    if (attendanceStatus !== undefined)
      record.attendanceStatus = attendanceStatus;
    if (loginTime !== undefined)
      record.loginTime = loginTime ? new Date(loginTime) : null;
    if (logoutTime !== undefined)
      record.logoutTime = logoutTime ? new Date(logoutTime) : null;
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

    res
      .status(200)
      .json(successResponse(record, "Attendance record updated successfully"));
  },
);
