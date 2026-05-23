import { Router } from "express";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

import { startSessionController } from "../controllers/start-session.controller";

import { getActiveSessionController } from "../controllers/get-active-session.controller";

import { endSessionController } from "../controllers/end-session.controller";

const router = Router();

router.post(
  "/start",

  authenticate,

  startSessionController
);

router.get(
  "/active",

  authenticate,

  getActiveSessionController
);

router.post(
  "/end",

  authenticate,

  endSessionController
);

export default router;