import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";
import {
  submitMyTodoController,
  getMyTodoTodayController,
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

const me = Router();
me.use(authenticate);
me.post("/todos", submitMyTodoController);
me.get("/todos/today", getMyTodoTodayController);
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

export { me as meDailyFlowRoutes, admin as adminDailyFlowRoutes };
