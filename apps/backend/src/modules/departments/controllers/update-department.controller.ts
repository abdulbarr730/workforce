import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Department } from "../model/department.model";

export const updateDepartmentController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;

    const updated = await Department.findByIdAndUpdate(id, updates, { returnDocument: 'after' });
    
    if (!updated) {
      return res.status(404).json({ success: false, error: "Department not found" });
    }
    
    return res.status(200).json(successResponse(updated, "Department updated successfully"));
  }
);
