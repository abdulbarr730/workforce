import { Router } from "express";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

import { getMyDailyAnalyticsController } from "../controllers/get-my-daily-analytics.controller";

import { getMyTrendAnalyticsController } from "../controllers/get-my-trend-analytics.controller";

const router = Router();

import { getActivityLogsController } from "../../analytics/controllers/get-activity-logs.controller";

router.get(
  "/analytics",

  authenticate,

  getMyDailyAnalyticsController,
);

router.get(
  "/analytics/logs",
  authenticate,
  getActivityLogsController,
);

router.get(
  "/trend",

  authenticate,

  getMyTrendAnalyticsController,
);

export default router;
