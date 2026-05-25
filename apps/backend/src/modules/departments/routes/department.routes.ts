import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { createDepartmentController } from "../controllers/create-department.controller";
import { getDepartmentsController } from "../controllers/get-departments.controller";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER"),
  getDepartmentsController
);

router.post(
  "/",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  createDepartmentController
);

export default router;