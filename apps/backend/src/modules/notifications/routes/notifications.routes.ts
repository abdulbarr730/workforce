import { Router } from "express";
import { getNotificationsStreamController } from "../controllers/notifications.controller";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";

const router = Router();

// Only Admins and Super Admins should listen to global system notifications
router.get(
  "/stream",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  getNotificationsStreamController
);

export default router;
