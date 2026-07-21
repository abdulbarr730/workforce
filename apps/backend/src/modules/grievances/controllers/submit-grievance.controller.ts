import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Grievance } from "../model/grievance.model";

export const submitGrievanceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { title, description } = req.body;
    const user = (req as any).user;

    const grievance = await Grievance.create({
      employeeId: user.userId, // JWT gives userId as employeeId
      title,
      description,
    });

    return res
      .status(201)
      .json(successResponse(grievance, "Grievance submitted successfully"));
  }
);
