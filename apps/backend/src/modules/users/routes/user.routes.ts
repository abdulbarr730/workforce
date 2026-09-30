import { Router } from "express";
import { createUserController } from "../controllers/create-user.controller";
import { getUsersController } from "../controllers/get-users.controller";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";
import { updateUserController } from "../controllers/update-user.controller";
import { deleteUserController } from "../controllers/delete-user.controller";
import { permanentlyDeleteUserController } from "../controllers/permanently-delete-user.controller";
import { sendLoginDetailsController } from "../controllers/send-login-details.controller";
import {
  sendResetLinkController,
  setUserPasswordController,
} from "../controllers/admin-password.controller";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  createUserController,
);

router.get(
  "/",
  authenticate,
  authorize(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.HR,
    UserRole.MANAGER,
  ),
  getUsersController,
);

router.put(
  "/:id",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  updateUserController,
);

// New one-time password emailed (reset / resend login details).
router.post(
  "/:id/send-login-details",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  sendLoginDetailsController,
);

// Admin types a new password (optionally one-time, optionally emailed).
router.post(
  "/:id/set-password",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  setUserPasswordController,
);

// Email a "set your password" link.
router.post(
  "/:id/send-reset-link",
  authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  sendResetLinkController,
);

router.delete(
  "/:id/permanent",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  permanentlyDeleteUserController,
);

router.delete(
  "/:id",
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  deleteUserController,
);

export default router;
