import { Router } from "express";
import { shiftPolicyRoutes } from "./shift-policy.routes";
import { timeOffRoutes } from "./time-off.routes";
import { generateDailyAttendanceController } from "../controllers/generate-daily-attendance.controller";
import { getAttendanceRecordsController } from "../controllers/get-attendance-records.controller";
import { updateAttendanceRecordController } from "../controllers/update-attendance-record.controller";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";

const router = Router();

router.use("/shifts", shiftPolicyRoutes);
router.use("/time-off", timeOffRoutes);

router.post(
  "/generate",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  generateDailyAttendanceController,
);

router.get(
  "/records",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER", "EMPLOYEE"),
  getAttendanceRecordsController,
);

router.put(
  "/records/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  updateAttendanceRecordController,
);

export { router as attendanceRoutes };
