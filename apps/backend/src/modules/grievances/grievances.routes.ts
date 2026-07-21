import { Router } from "express";
import { submitGrievanceController } from "./controllers/submit-grievance.controller";
import { getMyGrievancesController } from "./controllers/get-my-grievances.controller";
import { getTeamGrievancesController } from "./controllers/get-team-grievances.controller";
import { getAllGrievancesController } from "./controllers/get-all-grievances.controller";
import { resolveGrievanceController } from "./controllers/resolve-grievance.controller";
import { authenticate } from "../../shared/middlwares/auth.middleware";
import { authorize } from "../../shared/middlwares/role.middleware";

const router = Router();

// Everyone can get their own and submit
router.get("/mine", authenticate, getMyGrievancesController);
router.post("/request", authenticate, submitGrievanceController);

// Managers can see their team's grievances
router.get(
  "/team",
  authenticate,
  authorize("MANAGER"),
  getTeamGrievancesController
);

// Admins can see all grievances
router.get(
  "/all",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR"),
  getAllGrievancesController
);

// Managers and Admins can resolve
router.put(
  "/:id/resolve",
  authenticate,
  authorize("SUPER_ADMIN", "ADMIN", "HR", "MANAGER"),
  resolveGrievanceController
);

export default router;
