import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Department } from "../model/department.model";
import { User } from "../../users/model/user.model";

export const deleteDepartmentController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const deleted = await Department.findByIdAndDelete(id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, error: "Department not found" });
    }

    // Unassign this department from any users who had it
    await User.updateMany(
      { departmentId: id },
      { $set: { departmentId: null, departmentName: null } },
    );

    return res
      .status(200)
      .json(successResponse(null, "Department deleted successfully"));
  },
);
