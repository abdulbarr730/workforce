import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Grievance } from "../model/grievance.model";

export const resolveGrievanceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { resolutionNote } = req.body;
    const user = (req as any).user;

    const grievance = await Grievance.findById(id);
    if (!grievance) {
      return res
        .status(404)
        .json({ success: false, message: "Grievance not found" });
    }

    grievance.status = "RESOLVED";
    grievance.resolvedBy = user.userId;
    grievance.resolvedAt = new Date();
    if (resolutionNote) grievance.resolutionNote = resolutionNote;

    await grievance.save();

    return res.json(
      successResponse(grievance, "Grievance resolved successfully")
    );
  }
);
