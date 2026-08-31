import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";
import {
  submitMyTodoController,
  submitCheckinController,
  getMyTodoTodayController,
  getMyTodoDeadlinesController,
  listTodosController,
} from "../controllers/todo.controllers";
import {
  submitMyEodController,
  getMyEodTodayController,
  listEodReportsController,
} from "../controllers/eod.controllers";
import { getMyShiftController } from "../controllers/my-shift.controller";
import { assignShiftController } from "../controllers/assign-shift.controller";
import { getMyPendingEodController } from "../controllers/pending-eod.controller";
import { getDailyStatusController } from "../controllers/get-daily-status.controller";
import { getMissedTasksController } from "../controllers/get-missed-tasks.controller";
import { getTeamMissedTasksController } from "../controllers/get-team-missed-tasks.controller";
import { getRecentEditsController } from "../controllers/get-recent-edits.controller";

import {
  getDailyFlowAnalysisController,
  generateDailyFlowAnalysisController,
} from "../controllers/eod-analysis.controller";

const me = Router();
me.use(authenticate);
me.post("/todos", submitMyTodoController);
me.post("/todos/checkin", submitCheckinController);
me.get("/todos/today", getMyTodoTodayController);
me.get("/todos/deadlines", getMyTodoDeadlinesController);
me.get("/missed-tasks", getMissedTasksController);
me.get("/team-missed-tasks", getTeamMissedTasksController);
me.post("/eod", submitMyEodController);
me.get("/eod/today", getMyEodTodayController);
me.get("/eod/pending", getMyPendingEodController);
me.get("/shift", getMyShiftController);
me.post("/shift/assign", assignShiftController);

const admin = Router();
admin.use(authenticate);
admin.use(authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR));
admin.get("/todos", listTodosController);
admin.get("/eod", listEodReportsController);
admin.get("/status", getDailyStatusController);
admin.get("/recent-edits", getRecentEditsController);
admin.get("/analysis/report", getDailyFlowAnalysisController);
admin.post("/analysis/generate", generateDailyFlowAnalysisController);

export { me as meDailyFlowRoutes, admin as adminDailyFlowRoutes };
