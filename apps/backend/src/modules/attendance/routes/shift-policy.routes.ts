import { Router } from "express";
import { createShiftPolicyController } from "../controllers/create-shift-policy.controller";
import { updateShiftPolicyController } from "../controllers/update-shift-policy.controller";
import { deleteShiftPolicyController } from "../controllers/delete-shift-policy.controller";
import { getAllShiftPoliciesController } from "../controllers/get-all-shift-policies.controller";
import { assignShiftController } from "../controllers/assign-shift.controller";

import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { validate } from "../../../shared/middlwares/validate.middleware";
import { createShiftPolicySchema } from "../validators/create-shift-policy.validator";

import { UserRole } from "../../../_shared/constants";

const router = Router();

// 1. Protect all routes below with Authentication
router.use(authenticate);

// 2. Create Shift Policy (Strictly Admin / Super Admin)
router.post(
  "/",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN), // Passed as spread args
  validate(createShiftPolicySchema),
  createShiftPolicyController,
);

router.put(
  "/:id",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate(createShiftPolicySchema),
  updateShiftPolicyController,
);

router.delete(
  "/:id",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  deleteShiftPolicyController,
);

// 3. Get All Shift Policies (For HR/Admin Dropdowns)
router.get(
  "/",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  getAllShiftPoliciesController,
);

// 4. Assign Shift to Employee
router.post(
  "/assign",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  assignShiftController,
);

export { router as shiftPolicyRoutes };
