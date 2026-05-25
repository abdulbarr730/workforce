import { Router } from "express";
import { createUserController } from "../controllers/create-user.controller";
import { getUsersController } from "../controllers/get-users.controller";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "@workforce/shared-constants";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  createUserController
);

router.get(
  "/",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR, UserRole.MANAGER),
  getUsersController
);

export default router;
