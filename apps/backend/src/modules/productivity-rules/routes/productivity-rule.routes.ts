import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { createRuleController } from "../controllers/create-rule.controller";
import { getRulesController } from "../controllers/get-rules.controller";
import { deleteRuleController } from "../controllers/delete-rule.controller";
import { updateRuleController } from "../controllers/update-rule.controller";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER"),
  getRulesController,
);

router.post(
  "/",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  createRuleController,
);

router.put(
  "/:id",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  updateRuleController,
);

router.delete(
  "/:id",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  deleteRuleController,
);

export default router;
