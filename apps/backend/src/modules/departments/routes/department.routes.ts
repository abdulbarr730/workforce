import { Router } from "express";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

import { authorize } from "../../../shared/middlwares/role.middleware";

import { createDepartmentController } from "../controllers/create-department.controller";

const router = Router();

router.post(
  "/",

  authenticate,

  authorize(
    "SUPER_ADMIN",
    "ADMIN",
    "HR"
  ),

  createDepartmentController
);

export default router;