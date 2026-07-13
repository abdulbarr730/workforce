import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { generateDailyAnalyticsController } from "../controllers/generate-daily-analytics.controller";
import { getEmployeeDailyAnalyticsController } from "../controllers/get-employee-daily-analytics.controller";
import { getEmployeeTrendAnalyticsController } from "../controllers/get-employee-trend-analytics.controller";
import { getTeamAnalyticsController } from "../controllers/get-team-analytics.controller";
import { getLiveStatsController } from "../controllers/get-live-stats.controller";
import { getActivityFeedController } from "../controllers/get-activity-feed.controller";
import { exportDetailedReportController } from "../controllers/export-detailed-report.controller";

import { getTeamIntelligenceController } from "../controllers/get-team-intelligence.controller";
import { syncTeamIntelligenceController } from "../controllers/sync-team-intelligence.controller";

const router = Router();

router.post("/generate-daily", authenticate, generateDailyAnalyticsController);
router.get(
  "/employee-daily",
  authenticate,
  getEmployeeDailyAnalyticsController,
);
router.get(
  "/employee-trend",
  authenticate,
  getEmployeeTrendAnalyticsController,
);
router.get("/team", authenticate, getTeamAnalyticsController);
router.get("/team-intelligence", authenticate, getTeamIntelligenceController);
router.post(
  "/team-intelligence/sync",
  authenticate,
  syncTeamIntelligenceController,
);
router.get("/live", authenticate, getLiveStatsController);
router.get("/feed", authenticate, getActivityFeedController);
router.get("/export", authenticate, exportDetailedReportController);

export default router;
