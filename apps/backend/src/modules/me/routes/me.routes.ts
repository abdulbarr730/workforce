import { Router } from "express";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

import { getMyDailyAnalyticsController } from "../controllers/get-my-daily-analytics.controller";

import { getMyTrendAnalyticsController } from "../controllers/get-my-trend-analytics.controller";

const router = Router();

router.get(
  "/analytics",

  authenticate,

  getMyDailyAnalyticsController,
);

router.get(
  "/trend",

  authenticate,

  getMyTrendAnalyticsController,
);

export default router;
