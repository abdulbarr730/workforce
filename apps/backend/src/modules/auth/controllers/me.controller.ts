import { Response } from "express";
import { User } from "../../users/model/user.model";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const meController = asyncHandler(
  async (
    req: AuthRequest,

    res: Response,
  ) => {
    const user = await User.findById(req.user?.userId).select("-password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json(successResponse(user, "Current user"));
  },
);
