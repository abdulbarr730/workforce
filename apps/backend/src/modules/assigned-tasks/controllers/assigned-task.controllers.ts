import { Response } from "express";
import { randomUUID } from "node:crypto";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AppError } from "../../../shared/utils/app-error";
import { successResponse } from "../../../shared/utils/api-response";
import { notificationService } from "../../../shared/services/notification.service";
import { UserRole } from "../../../_shared/constants";
import { User } from "../../users/model/user.model";
import { DailyTodo } from "../../daily-flow/model/daily-todo.model";
import { EodReport } from "../../daily-flow/model/eod-report.model";
import { AssignedTask } from "../model/assigned-task.model";

const repeatValues = new Set([
  "OFF",
  "DAILY",
  "EVERY_2_DAYS",
  "TWICE_WEEKLY",
  "WEEKLY",
]);
const priorities = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
const statuses = new Set([
  "REQUESTED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type ReminderFrequency =
  | "OFF"
  | "DAILY"
  | "EVERY_2_DAYS"
  | "TWICE_WEEKLY"
  | "WEEKLY";
type AssignedTaskSource = "ADMIN_DASHBOARD" | "TEAMS" | "MANUAL";
type AssignedTaskStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

const todayStr = () => new Date().toLocaleDateString("en-CA");

const readDate = (value: unknown, fallback = todayStr()) => {
  const date = String(value || fallback);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError("Invalid scheduled date. Use YYYY-MM-DD", 400);
  }
  return date;
};

const readOptionalDateTime = (value: unknown, field: string) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  return parsed;
};

const requireActor = (req: AuthRequest) => {
  if (!req.user?.employeeId) throw new AppError("Unauthorized", 401);
  return req.user;
};

const canManageAssignedTasks = (role?: string) =>
  [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.HR,
    UserRole.MANAGER,
  ].includes(role as UserRole);

async function ensureTodoLink(task: any) {
  if (!task.addToTodo) return task;
  if (task.todoItemTaskId && task.todoDate) return task;

  const todoDate = task.scheduledFor || todayStr();
  const todo =
    (await DailyTodo.findOne({
      employeeId: task.assignedToEmployeeId,
      date: todoDate,
    })) ||
    new DailyTodo({
      employeeId: task.assignedToEmployeeId,
      date: todoDate,
      items: [],
    });

  const itemTaskId = randomUUID();
  (todo.items as any[]).push({
    taskId: itemTaskId,
    text: task.title,
    timeTaken: task.estimatedTime || "",
    estimatedTime: task.estimatedTime || "",
    scheduledFor: todoDate,
    deadlineAt: task.deadlineAt || null,
    reminderAt: task.reminderAt || null,
    remindDailyUntilDeadline: false,
    deadlineReminderFrequency: task.reminderFrequency || "OFF",
    recurrenceType: "NONE",
    recurrenceFrequency: "OFF",
    recurrenceStoppedAt: null,
    recurrenceGeneratedFor: "",
    parentTaskId: "",
    seriesId: "",
    isTopTask: false,
    done: task.status === "COMPLETED",
    completedAt: task.status === "COMPLETED" ? new Date() : null,
  });
  await todo.save();

  task.todoDate = todoDate;
  task.todoItemTaskId = itemTaskId;
  await task.save();
  return task;
}

async function updateLinkedTodoDone(task: any, done: boolean) {
  if (!task.todoItemTaskId || !task.todoDate) return;
  const todo = await DailyTodo.findOne({
    employeeId: task.assignedToEmployeeId,
    date: task.todoDate,
  });
  if (!todo) return;
  const item = (todo.items as any[]).find(
    (entry) => String(entry.taskId || "") === String(task.todoItemTaskId),
  );
  if (!item) return;
  item.done = done;
  item.completedAt = done ? task.completedAt || new Date() : null;
  if (task.actualTime) {
    item.timeTaken = task.actualTime;
    item.estimatedTime = task.actualTime;
  }
  await todo.save();
}

async function appendTaskToExistingEod(task: any) {
  if (!task.autoAddToEodOnComplete || task.eodAddedAt) return;
  const report = await EodReport.findOne({
    employeeId: task.assignedToEmployeeId,
    date: task.todoDate || task.scheduledFor || todayStr(),
  });
  if (!report) return;
  const alreadyAdded = (report.tasksWithTimings as any[]).some(
    (entry) =>
      String(entry.text || "").trim().toLowerCase() ===
      String(task.title || "").trim().toLowerCase(),
  );
  if (!alreadyAdded) {
    (report.tasksWithTimings as any[]).push({
      text: task.title,
      interval: "Manager assigned task",
      timeTaken: task.actualTime || task.estimatedTime || "",
      isTopTask: false,
    });
    report.completedItems = Array.from(
      new Set([...(report.completedItems || []), task.title]),
    );
    await report.save();
  }
  task.eodAddedAt = new Date();
  await task.save();
}

const serializeTask = (task: any) => {
  const raw = typeof task?.toObject === "function" ? task.toObject() : task;
  return raw ? { ...raw, id: String(raw._id) } : null;
};

export const createAssignedTaskController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const actor = requireActor(req);
    if (!canManageAssignedTasks(actor.role)) {
      throw new AppError("Forbidden", 403);
    }

    const body = req.body || {};
    const title = String(body.title || "").trim();
    if (!title) throw new AppError("Task title is required", 400);
    const assignedToEmployeeId = String(body.assignedToEmployeeId || "").trim();
    if (!assignedToEmployeeId) {
      throw new AppError("Assign this task to an employee", 400);
    }

    const employee = await User.findOne({
      employeeId: assignedToEmployeeId,
      isActive: true,
    }).lean();
    if (!employee) throw new AppError("Assigned employee not found", 404);

    const scheduledFor = readDate(body.scheduledFor);
    const priority: TaskPriority = priorities.has(String(body.priority))
      ? (String(body.priority) as TaskPriority)
      : "NORMAL";
    const reminderFrequency: ReminderFrequency = repeatValues.has(
      String(body.reminderFrequency),
    )
      ? (String(body.reminderFrequency) as ReminderFrequency)
      : "OFF";
    const source: AssignedTaskSource = ["ADMIN_DASHBOARD", "TEAMS", "MANUAL"]
      .includes(String(body.source))
      ? (String(body.source) as AssignedTaskSource)
      : "ADMIN_DASHBOARD";

    const task = await AssignedTask.create({
      title,
      description: String(body.description || "").trim(),
      priority,
      source,
      assignedByEmployeeId: actor.employeeId,
      assignedByName: actor.name || actor.employeeId,
      assignedToEmployeeId,
      assignedToName: employee.name,
      assignedToDepartmentName: employee.departmentName || "",
      scheduledFor,
      deadlineAt: readOptionalDateTime(body.deadlineAt, "deadline"),
      reminderAt: readOptionalDateTime(body.reminderAt, "reminder"),
      reminderFrequency,
      estimatedTime: String(body.estimatedTime || "").trim(),
      addToTodo: body.addToTodo !== false,
      autoAddToEodOnComplete: body.autoAddToEodOnComplete !== false,
      teamsMessageId: String(body.teamsMessageId || ""),
      teamsConversationId: String(body.teamsConversationId || ""),
    });

    await ensureTodoLink(task);

    notificationService.broadcastToUser(
      assignedToEmployeeId,
      "assigned_task_created",
      {
        title: "New assigned task",
        message: `${actor.name || actor.employeeId} assigned: ${title}`,
        task: serializeTask(task),
      },
    );

    res
      .status(201)
      .json(successResponse(serializeTask(task), "Assigned task created"));
  },
);

export const listAssignedTasksController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const actor = requireActor(req);
    if (!canManageAssignedTasks(actor.role)) {
      throw new AppError("Forbidden", 403);
    }
    const filter: Record<string, unknown> = {};
    if (req.query.status && String(req.query.status) !== "ALL") {
      filter.status = String(req.query.status);
    }
    if (req.query.employeeId && String(req.query.employeeId) !== "ALL") {
      filter.assignedToEmployeeId = String(req.query.employeeId);
    }
    const tasks = await AssignedTask.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(Number(req.query.limit) || 200, 1), 500))
      .lean();
    res.json(successResponse(tasks.map(serializeTask), "Assigned tasks fetched"));
  },
);

export const listMyAssignedTasksController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const actor = requireActor(req);
    const filter: Record<string, unknown> = {
      assignedToEmployeeId: actor.employeeId,
    };
    if (req.query.status && String(req.query.status) !== "ALL") {
      filter.status = String(req.query.status);
    }
    const tasks = await AssignedTask.find(filter)
      .sort({ deadlineAt: 1, createdAt: -1 })
      .limit(200)
      .lean();
    res.json(successResponse(tasks.map(serializeTask), "My assigned tasks fetched"));
  },
);

export const updateAssignedTaskController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const actor = requireActor(req);
    const task = await AssignedTask.findById(req.params.id);
    if (!task) throw new AppError("Assigned task not found", 404);

    const isAssignee = task.assignedToEmployeeId === actor.employeeId;
    const isManager = canManageAssignedTasks(actor.role);
    if (!isAssignee && !isManager) throw new AppError("Forbidden", 403);

    const body = req.body || {};
    const requestedStatus = body.status ? String(body.status) : "";
    if (requestedStatus && !statuses.has(requestedStatus)) {
      throw new AppError("Invalid task status", 400);
    }

    if (isManager && !isAssignee) {
      if (body.title !== undefined) task.title = String(body.title || "").trim();
      if (body.description !== undefined)
        task.description = String(body.description || "").trim();
      if (body.priority !== undefined && priorities.has(String(body.priority))) {
        task.priority = String(body.priority) as TaskPriority;
      }
      if (body.deadlineAt !== undefined)
        task.deadlineAt = readOptionalDateTime(body.deadlineAt, "deadline");
      if (body.reminderAt !== undefined)
        task.reminderAt = readOptionalDateTime(body.reminderAt, "reminder");
      if (
        body.reminderFrequency !== undefined &&
        repeatValues.has(String(body.reminderFrequency))
      ) {
        task.reminderFrequency = String(
          body.reminderFrequency,
        ) as ReminderFrequency;
      }
      if (body.estimatedTime !== undefined)
        task.estimatedTime = String(body.estimatedTime || "").trim();
      if (body.addToTodo !== undefined) task.addToTodo = Boolean(body.addToTodo);
      if (body.autoAddToEodOnComplete !== undefined)
        task.autoAddToEodOnComplete = Boolean(body.autoAddToEodOnComplete);
    }

    if (body.comment) {
      (task.comments as any[]).push({
        byEmployeeId: actor.employeeId,
        byName: actor.name || actor.employeeId,
        message: String(body.comment).trim(),
        createdAt: new Date(),
      });
    }

    if (requestedStatus) {
      task.status = requestedStatus as AssignedTaskStatus;
      if (requestedStatus === "ACCEPTED" && !task.acceptedAt)
        task.acceptedAt = new Date();
      if (requestedStatus === "IN_PROGRESS" && !task.startedAt)
        task.startedAt = new Date();
      if (requestedStatus === "COMPLETED") {
        task.completedAt = new Date();
        task.actualTime = String(body.actualTime || task.actualTime || "").trim();
        task.completionNote = String(
          body.completionNote || task.completionNote || "",
        ).trim();
        await ensureTodoLink(task);
        await updateLinkedTodoDone(task, true);
      }
      if (requestedStatus === "CANCELLED") task.cancelledAt = new Date();
    }

    if (body.addToTodoNow === true) {
      task.addToTodo = true;
      await ensureTodoLink(task);
    }

    await task.save();
    if (task.status === "COMPLETED") await appendTaskToExistingEod(task);

    notificationService.broadcastToUser(
      task.assignedToEmployeeId,
      "assigned_task_updated",
      { task: serializeTask(task) },
    );
    notificationService.broadcastToRoles(
      [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR, UserRole.MANAGER],
      "assigned_task_updated",
      { task: serializeTask(task) },
    );

    res.json(successResponse(serializeTask(task), "Assigned task updated"));
  },
);

export const cancelAssignedTaskController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const actor = requireActor(req);
    if (!canManageAssignedTasks(actor.role)) throw new AppError("Forbidden", 403);
    const task = await AssignedTask.findById(req.params.id);
    if (!task) throw new AppError("Assigned task not found", 404);
    task.status = "CANCELLED";
    task.cancelledAt = new Date();
    await task.save();
    notificationService.broadcastToUser(
      task.assignedToEmployeeId,
      "assigned_task_updated",
      { task: serializeTask(task) },
    );
    res.json(successResponse(serializeTask(task), "Assigned task cancelled"));
  },
);
