import { Router } from "express";
import { shiftPolicyRoutes } from "./shift-policy.routes";
import { timeOffRoutes } from "./time-off.routes";
import { generateDailyAttendanceController } from "../controllers/generate-daily-attendance.controller";
import { getAttendanceRecordsController } from "../controllers/get-attendance-records.controller";
import { updateAttendanceRecordController } from "../controllers/update-attendance-record.controller";
import {
  getMonthlyShortfallController,
  resetMonthlyShortfallController,
} from "../controllers/shortfall.controller";
import {
  cancelAttendanceChangeRequestController,
  createAttendanceChangeRequestController,
  decideAttendanceChangeRequestController,
  getAttendanceChangeRequestsController,
  getMyAttendanceChangeRequestsController,
} from "../controllers/attendance-change-request.controller";
import { exportRequestsController } from "../controllers/requests-export.controller";
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

router.get(
  "/shortfall",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER", "EMPLOYEE"),
  getMonthlyShortfallController,
);

router.post(
  "/shortfall/reset",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN"),
  resetMonthlyShortfallController,
);

router.put(
  "/records/:id",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN"),
  updateAttendanceRecordController,
);

// Attendance correction requests (employees ask, admins decide).
router.post(
  "/change-requests",
  authenticate,
  createAttendanceChangeRequestController,
);
router.get(
  "/change-requests/mine",
  authenticate,
  getMyAttendanceChangeRequestsController,
);
router.patch(
  "/change-requests/:id/cancel",
  authenticate,
  cancelAttendanceChangeRequestController,
);
router.get(
  "/change-requests",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  getAttendanceChangeRequestsController,
);
router.patch(
  "/change-requests/:id/decide",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  decideAttendanceChangeRequestController,
);

// Monthly Excel of every leave / half-day request and attendance correction.
router.get(
  "/requests/export",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  exportRequestsController,
);

export { router as attendanceRoutes };
