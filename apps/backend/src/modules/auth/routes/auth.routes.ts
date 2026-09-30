import { Router } from "express";

import { loginController } from "../controllers/login.controller";

import { meController } from "../controllers/me.controller";

import { changePasswordController } from "../controllers/change-password.controller";

import { resetPasswordController } from "../controllers/reset-password.controller";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

const router = Router();

router.post(
  "/login",

  loginController,
);

router.get(
  "/me",

  authenticate,

  meController,
);

// Set your own password (required after a one-time password).
router.post("/change-password", authenticate, changePasswordController);

// Public: set a password with an emailed link.
router.post("/reset-password", resetPasswordController);
export default router;
