import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";
import {
  submitMyTodoController,
  submitCheckinController,
  getMyTodoTodayController,
  getMyTodoDeadlinesController,
  createMyScheduledTodoController,
  getMyScheduledTodosController,
  getMyUpcomingTodosController,
  updateMyScheduledTodoController,
  deleteMyScheduledTodoController,
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
  bulkImportBreakSchedulesController,
  createBreakScheduleController,
  deleteBreakScheduleController,
  getMyBreakSchedulesTodayController,
  listBreakSchedulesController,
  updateBreakScheduleController,
} from "../controllers/break-schedule.controllers";

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
me.get("/todos/scheduled", getMyScheduledTodosController);
me.post("/todos/scheduled", createMyScheduledTodoController);
me.get("/todos/upcoming", getMyUpcomingTodosController);
me.put("/todos/:todoId/items/:itemIndex", updateMyScheduledTodoController);
me.delete("/todos/:todoId/items/:itemIndex", deleteMyScheduledTodoController);
me.get("/missed-tasks", getMissedTasksController);
me.get("/team-missed-tasks", getTeamMissedTasksController);
me.post("/eod", submitMyEodController);
me.get("/eod/today", getMyEodTodayController);
me.get("/eod/pending", getMyPendingEodController);
me.get("/shift", getMyShiftController);
me.post("/shift/assign", assignShiftController);
me.get("/break-schedules/today", getMyBreakSchedulesTodayController);

const admin = Router();
admin.use(authenticate);
admin.use(authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR));
admin.get("/todos", listTodosController);
admin.get("/eod", listEodReportsController);
admin.get("/status", getDailyStatusController);
admin.get("/recent-edits", getRecentEditsController);
admin.get("/analysis/report", getDailyFlowAnalysisController);
admin.post("/analysis/generate", generateDailyFlowAnalysisController);
admin.get("/break-schedules", listBreakSchedulesController);
admin.post("/break-schedules", createBreakScheduleController);
admin.post("/break-schedules/import", bulkImportBreakSchedulesController);
admin.patch("/break-schedules/:id", updateBreakScheduleController);
admin.delete("/break-schedules/:id", deleteBreakScheduleController);

export { me as meDailyFlowRoutes, admin as adminDailyFlowRoutes };
