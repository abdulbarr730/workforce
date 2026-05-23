import { Router } from "express";

import { ingestEventsController } from "../controllers/ingest-events.controller";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

const router = Router();

router.post(
  "/ingest",

  authenticate,

  ingestEventsController
);

export default router;