import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { LeaveRequest } from "../model/leave-request.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../../users/model/user.model";
import { paidSplitFor } from "../services/leave-policy.service";

export const getAllLeavesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // ?month=YYYY-MM returns leaves touching that month (for monthly export).
    const month = String(req.query.month || "");
    const filter: Record<string, unknown> = {};
    if (/^\d{4}-\d{2}$/.test(month)) {
      filter.startDate = { $lte: `${month}-31~` };
      filter.endDate = { $gte: `${month}-01` };
    }
    const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 }).lean();
    const missing = Array.from(
      new Set(
        leaves
          .filter((leave: any) => !leave.employeeName)
          .map((leave: any) => leave.employeeId),
      ),
    );
    const names = new Map<string, string>();
    if (missing.length) {
      const users = await User.find({ employeeId: { $in: missing } })
        .select("employeeId name")
        .lean();
      users.forEach((user: any) => names.set(String(user.employeeId), user.name));
    }
    // Paid / unpaid days (over the balance = unpaid).
    const split = await paidSplitFor(
      leaves.filter((leave: any) => ["APPROVED", "PENDING"].includes(leave.status)) as any,
    );
    const withNames = leaves.map((leave: any) => ({
      ...leave,
      employeeName:
        leave.employeeName || names.get(leave.employeeId) || leave.employeeId,
      paidDays: split.get(String(leave._id))?.paid ?? null,
      monthlyPaidDays: split.get(String(leave._id))?.monthly ?? null,
      floatingPaidDays: split.get(String(leave._id))?.floating ?? null,
      unpaidDays: split.get(String(leave._id))?.unpaid ?? null,
    }));
    res.status(200).json(successResponse(withNames, "All leave requests fetched"));
  },
);

export const getMyLeavesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    const leaves = await LeaveRequest.find({ employeeId })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(successResponse(leaves, "My leave requests fetched"));
  },
);
