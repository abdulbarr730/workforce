import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";
import { getSystemOverviewController } from "../controllers/system-overview.controller";

const router = Router();

// Admin Controls: server, database, emails, AI cost (limited roles need
// the "admin-controls.view" permission, see access-catalog.ts).
router.get("/overview", authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN), getSystemOverviewController);

export default router;
