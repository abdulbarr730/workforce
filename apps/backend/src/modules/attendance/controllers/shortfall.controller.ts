import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AttendanceShortfallAdjustment } from "../model/attendance-shortfall-adjustment.model";
import { getMonthlyShortfall } from "../services/monthly-shortfall.service";

const readMonth = (value: unknown) => {
  const month = String(value || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppError("Invalid month format (expected YYYY-MM)", 400);
  }
  return month;
};

export const getMonthlyShortfallController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const month = readMonth(req.query.month);
    const requestedEmployeeId = String(req.query.employeeId || "").trim();
    const employeeId =
      req.user?.role === "EMPLOYEE"
        ? req.user.employeeId
        : requestedEmployeeId || undefined;

    const result = await getMonthlyShortfall({ month, employeeId });
    res.json(successResponse(result, "Monthly attendance shortfall fetched"));
  },
);

export const resetMonthlyShortfallController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const month = readMonth(req.body?.month);
    const employeeId = String(req.body?.employeeId || "").trim();
    const reason = String(req.body?.reason || "").trim();

    if (!employeeId) throw new AppError("Employee is required", 400);
    if (reason.length < 3) {
      throw new AppError("A reset reason is required", 400);
    }

    const before = await getMonthlyShortfall({ month, employeeId });
    const employee = before.employees[0];
    if (!employee) throw new AppError("Employee not found", 404);
    if (employee.shortfallMinutes <= 0) {
      throw new AppError("This employee has no shortfall to reset", 400);
    }

    await AttendanceShortfallAdjustment.create({
      employeeId,
      month,
      appliedMinutes: employee.shortfallMinutes,
      reason,
      resetByEmployeeId: req.user!.employeeId,
      resetByName: req.user!.name,
    });

    const after = await getMonthlyShortfall({ month, employeeId });
    res.json(
      successResponse(after.employees[0], "Monthly shortfall reset recorded"),
    );
  },
);
