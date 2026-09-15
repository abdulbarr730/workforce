import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import {
  getWorkforceBrainContextController,
  getWorkforceBrainStatusController,
  trainWorkforceBrainController,
} from "../controllers/workforce-brain.controller";

const router = Router();

router.use(authenticate);

router.get(
  "/status",
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  getWorkforceBrainStatusController,
);
router.get(
  "/context",
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER"),
  getWorkforceBrainContextController,
);
router.post(
  "/train",
  authorize("SUPER_ADMIN", "ADMIN"),
  trainWorkforceBrainController,
);

export default router;
