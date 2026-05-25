import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { createRuleController } from "../controllers/create-rule.controller";
import { getRulesController } from "../controllers/get-rules.controller";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER"),
  getRulesController
);

router.post(
  "/",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  createRuleController
);

export default router;