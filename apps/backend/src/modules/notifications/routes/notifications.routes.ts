import { Router } from "express";
import {
  getAdminNotificationController,
  getAdminNotificationsController,
  getNotificationsStreamController,
  markAdminNotificationCategoryReadController,
  markAdminNotificationReadController,
  markAllAdminNotificationsReadController,
} from "../controllers/notifications.controller";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";

const router = Router();

// Everyone can listen to the stream, the service will filter what they receive
router.get(
  "/stream",
  authenticate,
  authorize(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.EMPLOYEE,
    UserRole.HR,
    UserRole.MANAGER,
  ),
  getNotificationsStreamController,
);

router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.HR),
  getAdminNotificationsController,
);
router.patch(
  "/read-all",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.HR),
  markAllAdminNotificationsReadController,
);
router.patch(
  "/read-category",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.HR),
  markAdminNotificationCategoryReadController,
);
router.get(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.HR),
  getAdminNotificationController,
);
router.patch(
  "/:id/read",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.HR),
  markAdminNotificationReadController,
);

export default router;
