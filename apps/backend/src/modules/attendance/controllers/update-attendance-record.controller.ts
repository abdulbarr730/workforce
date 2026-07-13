import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AttendanceRecord } from "../model/attendance-record.model";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const updateAttendanceRecordController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      attendanceStatus,
      loginTime,
      logoutTime,
      productiveMinutes,
      breakMinutes,
      offlineMinutes,
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
      record.loginTime = loginTime ? new Date(loginTime) : undefined;
    if (logoutTime !== undefined)
      record.logoutTime = logoutTime ? new Date(logoutTime) : undefined;
    if (productiveMinutes !== undefined)
      record.productiveMinutes = Number(productiveMinutes);
    if (breakMinutes !== undefined) record.breakMinutes = Number(breakMinutes);
    if (offlineMinutes !== undefined)
      record.idleMinutes = Number(offlineMinutes);
    if (lateMinutes !== undefined) record.lateMinutes = Number(lateMinutes);
    if (overtimeMinutes !== undefined)
      record.overtimeMinutes = Number(overtimeMinutes);

    await record.save();

    res
      .status(200)
      .json(successResponse(record, "Attendance record updated successfully"));
  },
);
