import { Router } from "express";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

import { generateDailyAnalyticsController } from "../controllers/generate-daily-analytics.controller";

import { getEmployeeDailyAnalyticsController } from "../controllers/get-employee-daily-analytics.controller";

import { getEmployeeTrendAnalyticsController } from "../controllers/get-employee-trend-analytics.controller";

import { getTeamAnalyticsController } from "../controllers/get-team-analytics.controller";

const router = Router();

router.post(
  "/generate-daily",

  authenticate,

  generateDailyAnalyticsController
);
    
router.get(
  "/employee-daily",

  authenticate,

  getEmployeeDailyAnalyticsController
);

router.get(
  "/employee-trend",

  authenticate,

  getEmployeeTrendAnalyticsController
);

router.get(
  "/team",

  authenticate,

  getTeamAnalyticsController
);

export default router;