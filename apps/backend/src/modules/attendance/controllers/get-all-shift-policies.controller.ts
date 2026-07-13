import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { ShiftPolicy } from "../model/shift-policy.model";

export const getAllShiftPoliciesController = asyncHandler(
  async (
    _req: Request,

    res: Response,
  ) => {
    const shifts = await ShiftPolicy.find().sort({
      createdAt: -1,
    });

    return res.json(
      successResponse(
        shifts,

        "Shift policies fetched",
      ),
    );
  },
);
