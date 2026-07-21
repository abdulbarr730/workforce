import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Grievance } from "../model/grievance.model";

export const getMyGrievancesController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;

    const grievances = await Grievance.find({ employeeId: user.userId }).sort({
      createdAt: -1,
    });

    return res.json(successResponse(grievances, "Fetched my grievances"));
  }
);
