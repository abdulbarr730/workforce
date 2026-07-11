import { Router } from "express";
import { ingestEventsController } from "../controllers/ingest-events.controller";
import { getSyncErrorsController } from "../controllers/get-sync-errors.controller";
import { authenticate } from "../../../shared/middlwares/auth.middleware";

const router = Router();

router.post("/ingest", authenticate, ingestEventsController);

router.get("/sync-errors", authenticate, getSyncErrorsController);

export default router;
