import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { Grievance } from "../model/grievance.model";

export const getAllGrievancesController = asyncHandler(
  async (req: Request, res: Response) => {
    const grievances = await Grievance.find().sort({ createdAt: -1 });

    return res.json(successResponse(grievances, "Fetched all grievances"));
  }
);
