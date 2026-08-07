import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { notificationService } from "../../../shared/services/notification.service";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AdminNotification } from "../model/admin-notification.model";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";

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
  },
);

const notificationScope = (req: AuthRequest) => ({
  audienceRoles: req.user?.role,
});

export const getAdminNotificationsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const unreadOnly = req.query.unreadOnly === "true";
    const scope = notificationScope(req);
    const filter = unreadOnly
      ? { ...scope, readBy: { $ne: employeeId } }
      : scope;

    const [notifications, unreadCount, todoCount, eodCount, leaveCount] =
      await Promise.all([
        AdminNotification.find(filter)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
        AdminNotification.countDocuments({
          ...scope,
          readBy: { $ne: employeeId },
        }),
        AdminNotification.countDocuments({
          ...scope,
          entityType: "TODO",
          readBy: { $ne: employeeId },
        }),
        AdminNotification.countDocuments({
          ...scope,
          entityType: "EOD",
          readBy: { $ne: employeeId },
        }),
        AdminNotification.countDocuments({
          ...scope,
          entityType: "LEAVE",
          readBy: { $ne: employeeId },
        }),
      ]);

    res.json(
      successResponse(
        {
          notifications,
          unreadCount,
          unreadByEntity: { TODO: todoCount, EOD: eodCount, LEAVE: leaveCount },
        },
        "Notifications fetched successfully",
      ),
    );
  },
);

export const getAdminNotificationController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const notification = await AdminNotification.findOne({
      _id: req.params.id,
      ...notificationScope(req),
    }).lean();
    if (!notification) throw new AppError("Notification not found", 404);
    res.json(
      successResponse(notification, "Notification fetched successfully"),
    );
  },
);

export const markAdminNotificationReadController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const notification = await AdminNotification.findOneAndUpdate(
      { _id: req.params.id, ...notificationScope(req) },
      { $addToSet: { readBy: employeeId } },
      { new: true },
    ).lean();
    if (!notification) throw new AppError("Notification not found", 404);
    res.json(successResponse(notification, "Notification marked as read"));
  },
);

export const markAllAdminNotificationsReadController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    await AdminNotification.updateMany(
      { ...notificationScope(req), readBy: { $ne: employeeId } },
      { $addToSet: { readBy: employeeId } },
    );
    res.json(successResponse(null, "All notifications marked as read"));
  },
);

export const markAdminNotificationCategoryReadController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.user?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const allowed = new Set(["TODO", "EOD", "LEAVE"]);
    const entityTypes = (
      Array.isArray(req.body.entityTypes) ? req.body.entityTypes : []
    ).filter((value: unknown) => allowed.has(String(value)));
    if (entityTypes.length === 0) {
      throw new AppError(
        "At least one valid notification category is required",
        400,
      );
    }
    await AdminNotification.updateMany(
      {
        ...notificationScope(req),
        entityType: { $in: entityTypes },
        readBy: { $ne: employeeId },
      },
      { $addToSet: { readBy: employeeId } },
    );
    res.json(successResponse(null, "Notification category marked as read"));
  },
);
