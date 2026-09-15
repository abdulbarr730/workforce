import { Response } from "express";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import {
  getWorkforceBrainContext,
  getWorkforceBrainStatus,
  trainWorkforceBrain,
} from "../services/workforce-brain.service";

export const trainWorkforceBrainController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const result = await trainWorkforceBrain({
      employeeId: req.body?.employeeId
        ? String(req.body.employeeId)
        : undefined,
      departmentId: req.body?.departmentId
        ? String(req.body.departmentId)
        : undefined,
      days: req.body?.days ? Number(req.body.days) : 60,
      includeClaude: req.body?.includeClaude !== false,
    });

    res.json(successResponse(result, result.message));
  },
);

export const getWorkforceBrainStatusController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.query.employeeId
      ? String(req.query.employeeId)
      : undefined;
    const result = await getWorkforceBrainStatus(employeeId);
    res.json(successResponse(result, "Workforce brain status fetched"));
  },
);

export const getWorkforceBrainContextController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId =
      req.query.employeeId || (req.user as any)?.employeeId || "";
    const result = await getWorkforceBrainContext(String(employeeId));
    res.json(successResponse(result, "Workforce brain context fetched"));
  },
);
