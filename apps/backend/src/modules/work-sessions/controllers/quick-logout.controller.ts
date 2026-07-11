import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { WorkSession } from "../model/work-session.model";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const quickLogoutController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Find the most recent active session that hasn't been logged out
    const activeSession = await WorkSession.findOne({
      employeeId: user.employeeId,
      logoutAt: null,
    }).sort({ loginAt: -1 });

    if (activeSession) {
      activeSession.logoutAt = new Date();
      await activeSession.save();
    }

    return res.json(
      successResponse(
        { loggedOut: true, time: new Date() },
        "Logged out successfully",
      ),
    );
  },
);
