import { Router } from "express";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

import { createRuleController } from "../controllers/create-rule.controller";

const router = Router();

router.post(
  "/",

  authenticate,

  createRuleController
);

export default router;