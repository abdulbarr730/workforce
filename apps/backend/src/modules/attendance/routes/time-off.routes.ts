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

export { router as timeOffRoutes };
