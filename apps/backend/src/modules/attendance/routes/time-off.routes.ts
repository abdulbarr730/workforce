import { Router } from "express";
import {
  createHolidayController,
  deleteHolidayController,
  getHolidaysController,
  updateHolidayController,
} from "../controllers/holiday.controller";
import {
  requestLeaveController,
  processLeaveController,
  updateLeaveController,
  deleteLeaveController,
} from "../controllers/leave.controller";
import {
  getAllLeavesController,
  getMyLeavesController,
} from "../controllers/get-all-leaves.controller";
import {
  createLeaveBlockController,
  getAllLeaveBalancesController,
  getLeaveAllowanceController,
  getLeaveBalanceController,
  getLeaveBlocksController,
  getLeavePolicyController,
  previewLeaveController,
  updateLeaveAllowanceController,
  updateLeaveBlockController,
  updateLeavePolicyController,
} from "../controllers/leave-policy.controller";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { validate } from "../../../shared/middlwares/validate.middleware";
import {
  createHolidaySchema,
  requestLeaveSchema,
  processLeaveSchema,
  updateHolidaySchema,
} from "../validators/time-off.validator";

const router = Router();
router.use(authenticate);

// --- HOLIDAY ROUTES ---
router.get("/holidays", getHolidaysController);
router.post(
  "/holidays",
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  validate(createHolidaySchema),
  createHolidayController,
);
router.patch(
  "/holidays/:holidayId",
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  validate(updateHolidaySchema),
  updateHolidayController,
);
router.delete(
  "/holidays/:holidayId",
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  deleteHolidayController,
);

// --- LEAVE ROUTES ---
router.get(
  "/leaves",
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER"),
  getAllLeavesController,
);
router.get("/leaves/mine", getMyLeavesController);

router.post(
  "/leaves/request",
  authorize("EMPLOYEE", "MANAGER", "HR", "ADMIN", "SUPER_ADMIN"),
  validate(requestLeaveSchema),
  requestLeaveController,
);

router.put(
  "/leaves/:leaveId",
  authorize("EMPLOYEE", "MANAGER", "HR", "ADMIN", "SUPER_ADMIN"),
  updateLeaveController,
);

router.delete(
  "/leaves/:leaveId",
  authorize("EMPLOYEE", "MANAGER", "HR", "ADMIN", "SUPER_ADMIN"),
  deleteLeaveController,
);

router.patch(
  "/leaves/:leaveId/process",
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  validate(processLeaveSchema),
  processLeaveController,
);

// --- LEAVE POLICY: types, limits, balances, blocked days ---
const LEAVE_ADMINS = ["SUPER_ADMIN", "ADMIN", "HR"] as const;
router.get("/leave-policy", getLeavePolicyController);
router.put("/leave-policy", authorize(...LEAVE_ADMINS), updateLeavePolicyController);
router.get("/leave-balance", getLeaveBalanceController);
router.get("/leave-preview", previewLeaveController);
router.get("/leave-balances", authorize(...LEAVE_ADMINS), getAllLeaveBalancesController);
router.get(
  "/leave-allowances/:employeeId",
  authorize(...LEAVE_ADMINS),
  getLeaveAllowanceController,
);
router.put(
  "/leave-allowances/:employeeId",
  authorize(...LEAVE_ADMINS),
  updateLeaveAllowanceController,
);
router.get("/leave-blocks", getLeaveBlocksController);
router.post("/leave-blocks", authorize(...LEAVE_ADMINS), createLeaveBlockController);
router.patch("/leave-blocks/:id", authorize(...LEAVE_ADMINS), updateLeaveBlockController);

export { router as timeOffRoutes };
