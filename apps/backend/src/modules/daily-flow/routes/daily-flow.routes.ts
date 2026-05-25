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
import { getMyPendingEodController } from "../controllers/pending-eod.controller";

const me = Router();
me.use(authenticate);
me.post("/todos", submitMyTodoController);
me.get("/todos/today", getMyTodoTodayController);
me.post("/eod", submitMyEodController);
me.get("/eod/today", getMyEodTodayController);
me.get("/eod/pending", getMyPendingEodController);
me.get("/shift", getMyShiftController);

const admin = Router();
admin.use(authenticate);
admin.use(authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR));
admin.get("/todos", listTodosController);
admin.get("/eod", listEodReportsController);

export { me as meDailyFlowRoutes, admin as adminDailyFlowRoutes };
