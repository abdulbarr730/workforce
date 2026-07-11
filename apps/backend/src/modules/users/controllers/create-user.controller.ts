import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { createUserSchema } from "../validators/create-user.validator";

import { createUser } from "../services/create-user.service";

export const createUserController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const validatedData = createUserSchema.parse(req.body);

    const user = await createUser(validatedData);

    return res.status(201).json(
      successResponse(
        user,

        "User created successfully",
      ),
    );
  },
);
