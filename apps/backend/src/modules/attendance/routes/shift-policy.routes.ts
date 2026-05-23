import { Router } from "express";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

import { authorize } from "../../../shared/middlwares/role.middleware";

import { getAllShiftPoliciesController } from "../controllers/get-all-shift-policies.controller";

import { assignShiftController } from "../controllers/assign-shift.controller";

const router = Router();

/*
  HR/Admin only
*/

router.get(
  "/",

  authenticate,

  authorize(
    "SUPER_ADMIN",

    "ADMIN",

    "HR"
  ),

  getAllShiftPoliciesController
);

router.post(
  "/assign",

  authenticate,

  authorize(
    "SUPER_ADMIN",

    "ADMIN",

    "HR"
  ),

  assignShiftController
);

export default router;