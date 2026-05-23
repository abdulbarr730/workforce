import { Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const meController =
  asyncHandler(
    async (
      req: AuthRequest,

      res: Response
    ) => {
      return res.status(200).json(
        successResponse(
          req.user,

          "Current user"
        )
      );
    }
  );