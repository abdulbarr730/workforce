import { Response } from "express";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { User } from "../model/user.model";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AppError } from "../../../shared/utils/app-error";

export const permanentlyDeleteUserController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employee = await User.findById(req.params.id);
    if (!employee) throw new AppError("User not found", 404);
    if (employee.isActive) {
      throw new AppError(
        "Mark the employee as inactive before permanent deletion",
        409,
      );
    }
    if (employee.role === "SUPER_ADMIN") {
      throw new AppError("A Super Admin account cannot be deleted here", 403);
    }

    await employee.deleteOne();
    res.status(200).json({
      success: true,
      message: "Former employee permanently deleted",
    });
  },
);
