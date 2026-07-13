import { Request, Response } from "express";

import { loginSchema } from "../validators/login.validator";

import { loginUser } from "../services/login.service";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

export const loginController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const validatedData = loginSchema.parse(req.body);

    const data = await loginUser(
      validatedData.email,
      validatedData.password,
      validatedData.deviceId,
    );

    return res.status(200).json(
      successResponse(
        data,

        "Login successful",
      ),
    );
  },
);
