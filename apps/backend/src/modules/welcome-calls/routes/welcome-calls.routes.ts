import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import {
  assignWelcomeCallLeadController,
  createWelcomeCallCampaignController,
  distributeWelcomeCallsController,
  exportWelcomeCallReportController,
  getMyWelcomeCallQueueController,
  getWelcomeCallContextController,
  getWelcomeCallLeadsController,
  getWelcomeCallReportController,
  ingestWelcomeCallRegistrationsController,
  updateWelcomeCallCampaignController,
  updateWelcomeCallOutcomeController,
} from "../controllers/welcome-calls.controller";

const router = Router();
router.use(authenticate);

router.get("/context", getWelcomeCallContextController);
router.get("/my-queue", getMyWelcomeCallQueueController);
router.patch("/leads/:id/outcome", updateWelcomeCallOutcomeController);
router.patch("/leads/:id/assign", assignWelcomeCallLeadController);

router.post(
  "/campaigns",
  authorize("SUPER_ADMIN", "ADMIN"),
  createWelcomeCallCampaignController,
);
router.patch("/campaigns/:id", updateWelcomeCallCampaignController);
router.post(
  "/campaigns/:id/registrations",
  ingestWelcomeCallRegistrationsController,
);
router.post("/campaigns/:id/distribute", distributeWelcomeCallsController);
router.get("/campaigns/:id/leads", getWelcomeCallLeadsController);
router.get("/campaigns/:id/report", getWelcomeCallReportController);
router.get("/campaigns/:id/export", exportWelcomeCallReportController);

export default router;
