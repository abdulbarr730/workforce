import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { notificationService } from "../../../shared/services/notification.service";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";

export const getNotificationsStreamController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Important for NGINX/Vercel to not buffer SSE

    res.flushHeaders();

    const role = req.user?.role || "UNKNOWN";
    const employeeId = req.user?.employeeId || "UNKNOWN";
    notificationService.addClient(res, role, employeeId);

    // Keep the connection alive
    const keepAlive = setInterval(() => {
      res.write(":\n\n");
    }, 15000);

    res.on("close", () => {
      clearInterval(keepAlive);
      res.end();
    });
  }
);
