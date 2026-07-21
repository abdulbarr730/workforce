import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { notificationService } from "../../../shared/services/notification.service";

export const getNotificationsStreamController = asyncHandler(
  async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Important for NGINX/Vercel to not buffer SSE

    res.flushHeaders();

    notificationService.addClient(res);

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
