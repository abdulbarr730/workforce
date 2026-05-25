import { Router } from "express";
import { shiftPolicyRoutes } from "./shift-policy.routes";
import { timeOffRoutes } from "./time-off.routes";
// Import your other attendance routes here (e.g., daily attendance generation)

const router = Router();

// Mount the shift policies under /api/v1/attendance/shifts
router.use("/shifts", shiftPolicyRoutes);
router.use("/time-off", timeOffRoutes);

export { router as attendanceRoutes };