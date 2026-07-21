import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Grievance } from "../model/grievance.model";
import { getManagerDepartment } from "../../departments/services/get-manager-department.service";
import { User } from "../../users/model/user.model";

export const getTeamGrievancesController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;

    const department = await getManagerDepartment(user.userId);
    if (!department) {
      return res
        .status(404)
        .json({ success: false, message: "Manager department not found" });
    }

    const teamMembers = await User.find({
      departmentId: department._id.toString(),
    }).lean();

    const employeeIds = teamMembers.map((m) => m.employeeId);

    const grievances = await Grievance.find({
      employeeId: { $in: employeeIds },
    }).sort({ createdAt: -1 });

    return res.json(successResponse(grievances, "Fetched team grievances"));
  }
);
