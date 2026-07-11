import { Router } from "express";

import { loginController } from "../controllers/login.controller";

import { meController } from "../controllers/me.controller";

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
export default router;
