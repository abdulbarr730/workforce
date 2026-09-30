import { Request, Response } from "express";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { getUsers } from "../services/get-users.service";

export const getUsersController = asyncHandler(
  async (
    req: Request,

    res: Response,
  ) => {
    const all = await getUsers();
    // The developer (Super Admin) account is not listed for anyone else.
    const viewerRole = String((req as any).user?.role || "");
    const users =
      viewerRole === "SUPER_ADMIN"
        ? all
        : (all as any[]).filter((u) => u?.role !== "SUPER_ADMIN");

    return res.status(200).json(
      successResponse(
        users,

        "Users fetched successfully",
      ),
    );
  },
);
