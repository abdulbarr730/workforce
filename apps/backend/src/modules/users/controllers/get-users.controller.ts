import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { getUsers } from "../services/get-users.service";

export const getUsersController = asyncHandler(
  async (
    _req: Request,

    res: Response,
  ) => {
    const users = await getUsers();

    return res.status(200).json(
      successResponse(
        users,

        "Users fetched successfully",
      ),
    );
  },
);
