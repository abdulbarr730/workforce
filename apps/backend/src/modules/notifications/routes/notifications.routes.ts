import { Router } from "express";
import { getNotificationsStreamController } from "../controllers/notifications.controller";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";

const router = Router();

// Everyone can listen to the stream, the service will filter what they receive
router.get(
  "/stream",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.EMPLOYEE, UserRole.HR, UserRole.MANAGER),
  getNotificationsStreamController
);

export default router;
