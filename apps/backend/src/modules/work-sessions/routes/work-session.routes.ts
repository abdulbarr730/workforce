import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { startSessionController } from "../controllers/start-session.controller";
import { getActiveSessionController } from "../controllers/get-active-session.controller";
import { endSessionController } from "../controllers/end-session.controller";
import { quickLogoutController } from "../controllers/quick-logout.controller";
import { getHistorySessionsController } from "../controllers/get-history-sessions.controller";
import { editTodoController } from "../controllers/edit-todo.controller";
import { editEodController } from "../controllers/edit-eod.controller";

const router = Router();

router.post("/start", authenticate, startSessionController);
router.get("/active", authenticate, getActiveSessionController);
router.post("/end", authenticate, endSessionController);
router.post("/quick-logout", authenticate, quickLogoutController);

router.get("/history", authenticate, getHistorySessionsController);
router.post("/:id/edit-todo", authenticate, editTodoController);
router.post("/:id/edit-eod", authenticate, editEodController);

export default router;
