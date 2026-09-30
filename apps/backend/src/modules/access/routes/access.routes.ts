import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";
import {
  createRoleController,
  getAccessCatalogController,
  getMyAccessController,
  listRolesController,
  setRoleActiveController,
  updateRoleController,
} from "../controllers/access.controller";

const router = Router();

router.get("/me", authenticate, getMyAccessController);
router.get("/catalog", authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR), getAccessCatalogController);
// Role names for the employee form (details only for the Super Admin).
router.get("/roles", authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR), listRolesController);

// Only the Super Admin creates and changes roles.
router.post("/roles", authenticate, authorize(UserRole.SUPER_ADMIN), createRoleController);
router.put("/roles/:key", authenticate, authorize(UserRole.SUPER_ADMIN), updateRoleController);
router.patch("/roles/:key/active", authenticate, authorize(UserRole.SUPER_ADMIN), setRoleActiveController);

export default router;
