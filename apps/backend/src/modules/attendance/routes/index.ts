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
import {
  getMyAttendanceChangesController,
  markMyAttendanceChangesSeenController,
} from "../controllers/my-attendance-changes.controller";
import {
  checkMarkLocationController,
  createWorkLocationController,
  decideRemoteMarkController,
  requestRemoteMarkController,
  getMarksController,
  getMarkSettingsController,
  getMarkStatusController,
  getWorkLocationsController,
  markAttendanceController,
  updateMarkSettingsController,
  updateWorkLocationController,
} from "../controllers/attendance-mark.controller";
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

// Employee: every change made to my attendance (and mark them seen).
router.get("/my-changes", authenticate, getMyAttendanceChangesController);
router.patch("/my-changes/seen", authenticate, markMyAttendanceChangesSeenController);

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

// Mark Attendance (agent) and work locations (admin).
router.get("/mark/status", authenticate, getMarkStatusController);
router.post("/mark", authenticate, markAttendanceController);
router.post("/mark/check", authenticate, checkMarkLocationController);
router.get("/mark/settings", authenticate, authorize("SUPER_ADMIN", "ADMIN"), getMarkSettingsController);
router.put("/mark/settings", authenticate, authorize("SUPER_ADMIN", "ADMIN"), updateMarkSettingsController);
router.get("/marks", authenticate, authorize("SUPER_ADMIN", "ADMIN", "HR"), getMarksController);
router.get("/locations", authenticate, authorize("SUPER_ADMIN", "ADMIN", "HR"), getWorkLocationsController);
router.post("/locations", authenticate, authorize("SUPER_ADMIN", "ADMIN"), createWorkLocationController);
router.patch("/locations/:id", authenticate, authorize("SUPER_ADMIN", "ADMIN"), updateWorkLocationController);
router.post("/mark/remote", authenticate, requestRemoteMarkController);
router.patch("/marks/:id/decide", authenticate, authorize("SUPER_ADMIN", "ADMIN"), decideRemoteMarkController);

export { router as attendanceRoutes };
