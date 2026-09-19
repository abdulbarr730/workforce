import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import {
  classifyAppController,
  getAppKnowledgeController,
  getWorkforceBrainContextController,
  getWorkforceBrainStatusController,
  inferActivityController,
  reviseMemoryController,
  trainWorkforceBrainController,
  updateDepartmentResponsibilitiesController,
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

router.get(
  "/app-knowledge",
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER"),
  getAppKnowledgeController,
);

router.post(
  "/classify-app",
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER"),
  classifyAppController,
);

router.post(
  "/infer-activity",
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER"),
  inferActivityController,
);

router.post(
  "/revise-memory",
  authorize("SUPER_ADMIN", "ADMIN"),
  reviseMemoryController,
);

router.put(
  "/department-responsibilities",
  authorize("SUPER_ADMIN", "ADMIN"),
  updateDepartmentResponsibilitiesController,
);

export default router;
