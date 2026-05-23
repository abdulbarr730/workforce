import { Router } from "express";
import { shiftPolicyRoutes } from "./shift-policy.routes";
// Import your other attendance routes here (e.g., daily attendance generation)

const router = Router();

// Mount the shift policies under /api/v1/attendance/shifts
router.use("/shifts", shiftPolicyRoutes);

export { router as attendanceRoutes };