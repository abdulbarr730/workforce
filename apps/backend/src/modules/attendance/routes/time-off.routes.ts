import { Router } from "express";
import { createHolidayController, getHolidaysController } from "../controllers/holiday.controller";
import { requestLeaveController, processLeaveController } from "../controllers/leave.controller";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { validate } from "../../../shared/middlwares/validate.middleware";
import { createHolidaySchema, requestLeaveSchema, processLeaveSchema } from "../validators/time-off.validator";
import { UserRole } from "@workforce/shared-constants";

const router = Router();
router.use(authenticate);

// --- HOLIDAY ROUTES ---
router.get("/holidays", getHolidaysController);
router.post(
  "/holidays",
  authorize("SUPER_ADMIN", "ADMIN", "HR"), // Emergency Bypass
  validate(createHolidaySchema),
  createHolidayController
);

// --- LEAVE ROUTES ---
router.post(
  "/leaves/request",
  authorize("EMPLOYEE", "MANAGER"), // Emergency Bypass
  validate(requestLeaveSchema),
  requestLeaveController
);

router.patch(
  "/leaves/:leaveId/process",
  authorize("SUPER_ADMIN", "ADMIN", "HR"), // Emergency Bypass
  validate(processLeaveSchema),
  processLeaveController
);

export { router as timeOffRoutes };