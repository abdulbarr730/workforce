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
  getPersonAccessController,
  listPersonalAccessController,
  setPersonAccessController,
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

// One person's own access on top of their role (Super Admin only).
router.get("/users", authenticate, authorize(UserRole.SUPER_ADMIN), listPersonalAccessController);
router.get("/users/:id", authenticate, authorize(UserRole.SUPER_ADMIN), getPersonAccessController);
router.put("/users/:id", authenticate, authorize(UserRole.SUPER_ADMIN), setPersonAccessController);

export default router;
