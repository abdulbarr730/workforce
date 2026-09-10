import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import {
  cancelAssignedTaskController,
  createAssignedTaskController,
  listAssignedTasksController,
  listMyAssignedTasksController,
  updateAssignedTaskController,
} from "../controllers/assigned-task.controllers";

const router = Router();

router.use(authenticate);
router.get("/mine", listMyAssignedTasksController);
router.get("/", listAssignedTasksController);
router.post("/", createAssignedTaskController);
router.patch("/:id", updateAssignedTaskController);
router.delete("/:id", cancelAssignedTaskController);

export default router;

