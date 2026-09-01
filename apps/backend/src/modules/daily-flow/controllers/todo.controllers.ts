import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { DailyTodo } from "../model/daily-todo.model";
import { User } from "../../users/model/user.model";
import { notificationService } from "../../../shared/services/notification.service";
import { getBusinessDate, readRequestedDate } from "../utils/business-date";

function todayStr() {
  return getBusinessDate();
}

function normalizeDeadlineFrequency(value: unknown) {
  const normalized = String(value || "OFF").toUpperCase();
  return ["OFF", "DAILY", "EVERY_2_DAYS", "WEEKLY"].includes(normalized)
    ? normalized
    : "OFF";
}

function readRequiredScheduledDate(value: unknown) {
  const scheduledFor = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    throw new AppError("Invalid scheduled date format. Use YYYY-MM-DD", 400);
  }

  const [year, month, day] = scheduledFor.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new AppError("Invalid scheduled date", 400);
  }

  return scheduledFor;
}

function readOptionalDateTime(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") return null;
  const timestamp = Date.parse(String(value));
  if (Number.isNaN(timestamp)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
  return new Date(timestamp);
}

function scheduledItemFingerprint(item: any) {
  const dateValue = (value: unknown) => {
    if (!value) return "";
    const parsed = new Date(value as any);
    return Number.isNaN(parsed.getTime())
      ? String(value)
      : parsed.toISOString();
  };
  return JSON.stringify({
    taskId: String(item?.taskId || ""),
    text: String(item?.text || ""),
    estimatedTime: String(item?.estimatedTime || item?.timeTaken || ""),
    scheduledFor: String(item?.scheduledFor || ""),
    deadlineAt: dateValue(item?.deadlineAt),
    reminderAt: dateValue(item?.reminderAt),
    deadlineReminderFrequency: normalizeDeadlineFrequency(
      item?.deadlineReminderFrequency,
    ),
    isTopTask: Boolean(item?.isTopTask),
    done: Boolean(item?.done),
    completedAt: dateValue(item?.completedAt),
  });
}

function findScheduledItemIndex(items: any[], itemKey: string) {
  const stableIndex = items.findIndex(
    (item) => String(item?.taskId || "") === itemKey,
  );
  if (stableIndex >= 0) return stableIndex;

  const legacyIndex = Number(itemKey);
  return Number.isInteger(legacyIndex) && legacyIndex >= 0 ? legacyIndex : -1;
}

function serializeTodo(todo: any) {
  if (!todo) return null;
  const raw = typeof todo.toObject === "function" ? todo.toObject() : todo;
  return {
    ...raw,
    items: (raw.items || []).map((item: any, index: number) => ({
      ...item,
      id: String(item.taskId || `${raw._id}:${index}`),
      taskId: item.taskId || null,
      todoId: String(raw._id),
      itemIndex: index,
    })),
  };
}

export const submitMyTodoController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const { items, date: bodyDate } = req.body as {
      items: Array<{
        text: string;
        timeTaken?: string;
        estimatedTime?: string;
        count?: number;
        isTopTask?: boolean;
        done?: boolean;
        completedAt?: string | null;
        scheduledFor?: string;
        deadlineAt?: string | null;
        reminderAt?: string | null;
        remindDailyUntilDeadline?: boolean;
        deadlineReminderFrequency?: string;
      }>;
      date?: string;
      silent?: boolean;
    };
    if (!Array.isArray(items) || items.length === 0)
      throw new AppError("At least one todo item is required", 400);

    const today = todayStr();
    let date = today;
    if (bodyDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bodyDate))
        throw new AppError("Invalid date format. Use YYYY-MM-DD", 400);
      date = bodyDate;
    }

    const cleaned = items
      .map((i) => {
        const scheduledFor =
          i.scheduledFor && /^\d{4}-\d{2}-\d{2}$/.test(i.scheduledFor)
            ? i.scheduledFor
            : date;
        return {
          taskId: String((i as any).taskId || "").trim() || randomUUID(),
          text: String(i.text || "").trim(),
          timeTaken: String(i.timeTaken || i.estimatedTime || "").trim(),
          estimatedTime: String(i.estimatedTime || i.timeTaken || "").trim(),
          scheduledFor,
          deadlineAt:
            i.deadlineAt && !Number.isNaN(Date.parse(i.deadlineAt))
              ? new Date(i.deadlineAt)
              : null,
          reminderAt:
            i.reminderAt && !Number.isNaN(Date.parse(i.reminderAt))
              ? new Date(i.reminderAt)
              : null,
          remindDailyUntilDeadline: Boolean(i.remindDailyUntilDeadline),
          deadlineReminderFrequency: i.remindDailyUntilDeadline
            ? "DAILY"
            : normalizeDeadlineFrequency(i.deadlineReminderFrequency),
          isTopTask: Boolean(i.isTopTask),
          done: Boolean(i.done),
          completedAt:
            i.done && i.completedAt && !Number.isNaN(Date.parse(i.completedAt))
              ? new Date(i.completedAt)
              : null,
        };
      })
      .filter((i) => i.text.length > 0);

    if (cleaned.length === 0)
      throw new AppError("Todo items cannot be empty", 400);

    const grouped = cleaned.reduce<Record<string, typeof cleaned>>(
      (acc, item) => {
        const targetDate = item.scheduledFor || date;
        acc[targetDate] = acc[targetDate] || [];
        acc[targetDate].push(item);
        return acc;
      },
      {},
    );

    const savedTodos = await Promise.all(
      Object.entries(grouped).map(async ([targetDate, targetItems]) => {
        let itemsToSave = targetItems;
        if (targetDate !== date) {
          const existingFutureTodo = await DailyTodo.findOne({
            employeeId,
            date: targetDate,
          }).lean();
          const incomingKeys = new Set(
            targetItems.map(
              (item) =>
                `${item.text.toLowerCase()}|${item.scheduledFor}|${item.deadlineAt?.toISOString?.() || ""}|${item.reminderAt?.toISOString?.() || ""}`,
            ),
          );
          const preservedExisting = (existingFutureTodo?.items || []).filter(
            (item: any) =>
              !incomingKeys.has(
                `${String(item.text || "").toLowerCase()}|${item.scheduledFor || targetDate}|${item.deadlineAt ? new Date(item.deadlineAt).toISOString() : ""}|${item.reminderAt ? new Date(item.reminderAt).toISOString() : ""}`,
              ),
          );
          itemsToSave = [...preservedExisting, ...targetItems] as any;
        }

        return DailyTodo.findOneAndUpdate(
          { employeeId, date: targetDate },
          { $set: { items: itemsToSave } },
          { upsert: true, returnDocument: "after" },
        );
      }),
    );
    const todo =
      savedTodos.find((entry: any) => entry?.date === date) || savedTodos[0];

    // Fetch user name and emit notification
    try {
      if (req.body?.silent === true) {
        return res.json(successResponse(todo, "Todo saved silently"));
      }
      const user = await User.findOne({ employeeId }, "name").lean();
      notificationService.broadcast("daily_flow_event", {
        title: "Todo Submitted",
        message: `${user?.name || employeeId} has submitted their daily todo list.`,
        employeeId: employeeId,
        type: "TODO",
      });
    } catch (err) {
      console.error("Failed to emit todo notification", err);
    }

    res.json(successResponse(todo, "Todo saved"));
  },
);

export const submitCheckinController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const { interval, completedTasks, notes, timeSpent, items } = req.body as {
      interval: string;
      completedTasks?: string[];
      notes?: string;
      timeSpent?: string;
      items?: Array<{
        text: string;
        timeTaken?: string;
        estimatedTime?: string;
        count?: number;
        isTopTask?: boolean;
        done?: boolean;
      }>;
    };

    if (!interval || !String(interval).trim()) {
      throw new AppError("Check-in interval is required", 400);
    }

    const today = todayStr();

    const structuredTasks = (Array.isArray(items) ? items : [])
      .map((i) => {
        const parsedCount = Number(i.count);
        return {
          text: String(i.text || "").trim(),
          interval: String(interval).trim(),
          timeTaken: String(i.timeTaken || i.estimatedTime || "").trim(),
          count:
            Number.isInteger(parsedCount) && parsedCount >= 1
              ? parsedCount
              : undefined,
          isTopTask: Boolean(i.isTopTask),
          done: Boolean(i.done !== false),
        };
      })
      .filter((i) => i.text.length > 0);

    const checkinData = {
      interval: String(interval).trim(),
      tasks: structuredTasks,
      completedTasks:
        Array.isArray(completedTasks) && completedTasks.length > 0
          ? completedTasks.filter(Boolean)
          : structuredTasks
              .filter((t) => t.done)
              .map((t) => `${t.text} (${t.timeTaken || "2h"})`),
      notes: String(notes || "").trim(),
      timeSpent: String(timeSpent || "").trim(),
      submittedAt: new Date(),
    };

    // Retrieve existing todo to update done flags on matching items WITHOUT overwriting morning items
    const existingTodo = await DailyTodo.findOne({ employeeId, date: today });
    let currentItems: any[] = existingTodo?.items
      ? existingTodo.items.map((i: any) => ({
          taskId: i.taskId,
          text: i.text,
          done: !!i.done,
          timeTaken: i.timeTaken || "",
          estimatedTime: i.estimatedTime || "",
          scheduledFor: i.scheduledFor || today,
          deadlineAt: i.deadlineAt || null,
          reminderAt: i.reminderAt || null,
          remindDailyUntilDeadline: Boolean(i.remindDailyUntilDeadline),
          deadlineReminderFrequency: i.remindDailyUntilDeadline
            ? "DAILY"
            : normalizeDeadlineFrequency(i.deadlineReminderFrequency),
          isTopTask: !!i.isTopTask,
          completedAt: i.completedAt || null,
        }))
      : [];

    if (currentItems.length > 0 && structuredTasks.length > 0) {
      // Mark matching morning items as done if marked in check-in
      currentItems = currentItems.map((item: any) => {
        const matchingTask = structuredTasks.find(
          (t) => t.text.toLowerCase() === (item.text || "").toLowerCase(),
        );
        if (matchingTask && matchingTask.done) {
          return { ...item, done: true };
        }
        return item;
      });
    }

    const todo = await DailyTodo.findOneAndUpdate(
      { employeeId, date: today },
      {
        $push: { checkins: checkinData },
        ...(currentItems.length > 0 ? { $set: { items: currentItems } } : {}),
      },
      { upsert: true, returnDocument: "after" },
    );

    try {
      const user = await User.findOne({ employeeId }, "name").lean();
      notificationService.broadcast("daily_flow_event", {
        title: "2-Hour Check-in Submitted",
        message: `${user?.name || employeeId} completed 2-hour check-in for ${interval}.`,
        employeeId,
        type: "CHECKIN",
      });
    } catch (err) {
      console.error("Failed to emit check-in notification", err);
    }

    res.json(successResponse(todo, "Check-in recorded successfully"));
  },
);

export const getMyTodoTodayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    let date: string;
    try {
      date = readRequestedDate(req.query.date);
    } catch {
      throw new AppError("Invalid date format (expected YYYY-MM-DD)", 400);
    }
    const todo = await DailyTodo.findOne({
      employeeId,
      date,
    }).lean();
    res.json(
      successResponse(
        serializeTodo(todo),
        todo ? "Todo found" : "No todo for today",
      ),
    );
  },
);

export const getMyTodoDeadlinesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const todos = await DailyTodo.find({
      employeeId,
      "items.deadlineAt": { $ne: null },
    })
      .sort({ date: 1 })
      .lean();

    const deadlineItems = todos.flatMap((todo: any) =>
      (todo.items || [])
        .filter((item: any) => item?.deadlineAt && !item.done)
        .map((item: any, index: number) => ({
          id: String(item.taskId || `${todo._id}:${index}`),
          taskId: item.taskId || null,
          todoId: String(todo._id),
          itemIndex: index,
          date: todo.date,
          text: item.text,
          scheduledFor: item.scheduledFor || todo.date,
          deadlineAt: item.deadlineAt,
          reminderAt: item.reminderAt || null,
          remindDailyUntilDeadline: Boolean(item.remindDailyUntilDeadline),
          deadlineReminderFrequency: item.remindDailyUntilDeadline
            ? "DAILY"
            : normalizeDeadlineFrequency(item.deadlineReminderFrequency),
        })),
    );

    res.json(successResponse(deadlineItems, "Todo deadlines fetched"));
  },
);

export const getMyUpcomingTodosController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const today = todayStr();
    const todos = await DailyTodo.find({
      employeeId,
      date: { $gt: today },
    })
      .sort({ date: 1 })
      .limit(60)
      .lean();

    const tasks = todos.flatMap((todo: any) =>
      (todo.items || []).map((item: any, index: number) => ({
        id: String(item.taskId || `${todo._id}:${index}`),
        taskId: item.taskId || null,
        todoId: String(todo._id),
        itemIndex: index,
        date: todo.date,
        text: item.text,
        done: Boolean(item.done),
        scheduledFor: item.scheduledFor || todo.date,
        deadlineAt: item.deadlineAt || null,
        reminderAt: item.reminderAt || null,
        deadlineReminderFrequency: item.remindDailyUntilDeadline
          ? "DAILY"
          : normalizeDeadlineFrequency(item.deadlineReminderFrequency),
      })),
    );

    res.json(successResponse(tasks, "Upcoming todos fetched"));
  },
);

export const getMyScheduledTodosController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const today = todayStr();
    const scheduleFilter = {
      employeeId,
      $or: [
        { date: { $gte: today } },
        { "items.deadlineAt": { $ne: null } },
        { "items.reminderAt": { $ne: null } },
      ],
    };
    let todos = await DailyTodo.find(scheduleFilter)
      .sort({ date: 1 })
      .limit(120)
      .lean();

    const backfills: any[] = [];
    for (const todo of todos as any[]) {
      (todo.items || []).forEach((item: any, index: number) => {
        if (String(item?.taskId || "").trim()) return;
        const taskId = randomUUID();
        item.taskId = taskId;
        const itemPath = `items.${index}.taskId`;
        backfills.push({
          updateOne: {
            filter: {
              _id: todo._id,
              $or: [{ [itemPath]: { $exists: false } }, { [itemPath]: "" }],
            },
            update: { $set: { [itemPath]: taskId } },
          },
        });
      });
    }
    if (backfills.length > 0) {
      await DailyTodo.bulkWrite(backfills, { ordered: false });
      todos = await DailyTodo.find(scheduleFilter)
        .sort({ date: 1 })
        .limit(120)
        .lean();
    }

    const tasks = todos
      .flatMap((todo: any) =>
        (todo.items || []).map((item: any, index: number) => ({
          id: String(item.taskId || `${todo._id}:${index}`),
          taskId: item.taskId || null,
          todoId: String(todo._id),
          itemIndex: index,
          date: todo.date,
          text: item.text,
          done: Boolean(item.done),
          completedAt: item.completedAt || null,
          estimatedTime: item.estimatedTime || item.timeTaken || "",
          scheduledFor: item.scheduledFor || todo.date,
          deadlineAt: item.deadlineAt || null,
          reminderAt: item.reminderAt || null,
          isTopTask: Boolean(item.isTopTask),
          deadlineReminderFrequency: item.remindDailyUntilDeadline
            ? "DAILY"
            : normalizeDeadlineFrequency(item.deadlineReminderFrequency),
        })),
      )
      .filter((item: any) => {
        if (!item.text) return false;
        if (!item.done) return true;
        return Boolean(item.deadlineAt || item.reminderAt);
      })
      .sort((a: any, b: any) =>
        String(a.scheduledFor || a.date).localeCompare(
          String(b.scheduledFor || b.date),
        ),
      );

    res.json(successResponse(tasks, "Scheduled todos fetched"));
  },
);

export const createMyScheduledTodoController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const body = req.body || {};
    const text = String(body.text || "").trim();
    if (!text) throw new AppError("Task title is required", 400);

    const scheduledFor = readRequiredScheduledDate(
      body.scheduledFor ?? body.date,
    );
    const estimatedTime = String(
      body.estimatedTime ?? body.timeTaken ?? "",
    ).trim();
    const done = Boolean(body.done);
    const taskId = randomUUID();
    const item = {
      taskId,
      text,
      timeTaken: estimatedTime,
      estimatedTime,
      scheduledFor,
      deadlineAt: readOptionalDateTime(body.deadlineAt, "deadline date/time"),
      reminderAt: readOptionalDateTime(body.reminderAt, "reminder date/time"),
      remindDailyUntilDeadline: false,
      deadlineReminderFrequency: normalizeDeadlineFrequency(
        body.deadlineReminderFrequency,
      ),
      isTopTask: Boolean(body.isTopTask),
      done,
      completedAt: done ? new Date() : null,
    };

    const todo = await DailyTodo.findOneAndUpdate(
      { employeeId, date: scheduledFor },
      { $push: { items: item } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    if (!todo) throw new AppError("Unable to create scheduled task", 500);

    const itemIndex = Math.max(0, todo.items.length - 1);
    res.status(201).json(
      successResponse(
        {
          id: taskId,
          todoId: String(todo._id),
          itemIndex,
          date: todo.date,
          ...item,
        },
        "Scheduled task created",
      ),
    );
  },
);

export const updateMyScheduledTodoController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const { todoId, itemIndex: itemKey } = req.params as {
      todoId: string;
      itemIndex: string;
    };

    const todo = await DailyTodo.findOne({ _id: todoId, employeeId });
    if (!todo) throw new AppError("Scheduled task not found", 404);
    const index = findScheduledItemIndex(todo.items as any[], itemKey);
    if (index < 0) throw new AppError("Scheduled task not found", 404);
    const current = (todo.items as any[])[index];
    if (!current) throw new AppError("Scheduled task not found", 404);

    const {
      text,
      scheduledFor,
      deadlineAt,
      reminderAt,
      deadlineReminderFrequency,
      done,
      estimatedTime,
      isTopTask,
    } = req.body || {};

    const targetDate = scheduledFor
      ? readRequiredScheduledDate(scheduledFor)
      : todo.date;

    const updatedItem = {
      taskId: String(current.taskId || randomUUID()),
      text: String(text ?? current.text ?? "").trim(),
      timeTaken: String(
        estimatedTime ?? current.estimatedTime ?? current.timeTaken ?? "",
      ).trim(),
      estimatedTime: String(
        estimatedTime ?? current.estimatedTime ?? current.timeTaken ?? "",
      ).trim(),
      scheduledFor: targetDate,
      deadlineAt:
        deadlineAt && !Number.isNaN(Date.parse(deadlineAt))
          ? new Date(deadlineAt)
          : null,
      reminderAt:
        reminderAt && !Number.isNaN(Date.parse(reminderAt))
          ? new Date(reminderAt)
          : null,
      remindDailyUntilDeadline: false,
      deadlineReminderFrequency: normalizeDeadlineFrequency(
        deadlineReminderFrequency,
      ),
      isTopTask: Boolean(isTopTask ?? current.isTopTask),
      done: Boolean(done),
      completedAt: Boolean(done) ? current.completedAt || new Date() : null,
    };
    if (!updatedItem.text) throw new AppError("Task title is required", 400);

    const expectedFingerprint = scheduledItemFingerprint(current);
    const source = await DailyTodo.findOne({ _id: todoId, employeeId });
    if (!source) throw new AppError("Scheduled task not found", 404);

    const sourceIndex = findScheduledItemIndex(source.items as any[], itemKey);
    const sourceItem = (source.items as any[])[sourceIndex];
    if (!sourceItem) throw new AppError("Scheduled task not found", 404);
    if (scheduledItemFingerprint(sourceItem) !== expectedFingerprint) {
      throw new AppError(
        "This task changed in another window. Refresh and try again.",
        409,
      );
    }

    if (targetDate === source.date) {
      (source.items as any[]).splice(sourceIndex, 1, updatedItem);
      await source.save();
      return res.json(
        successResponse(serializeTodo(source), "Scheduled task updated"),
      );
    }

    await DailyTodo.findOneAndUpdate(
      { employeeId, date: targetDate },
      { $push: { items: updatedItem } },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      },
    );

    (source.items as any[]).splice(sourceIndex, 1);
    if ((source.items as any[]).length === 0 && !source.checkins?.length) {
      await DailyTodo.deleteOne({ _id: source._id });
    } else {
      await source.save();
    }

    res.json(successResponse(null, "Scheduled task updated"));
  },
);

export const deleteMyScheduledTodoController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const { todoId, itemIndex: itemKey } = req.params as {
      todoId: string;
      itemIndex: string;
    };

    const todo = await DailyTodo.findOne({ _id: todoId, employeeId });
    if (!todo) throw new AppError("Scheduled task not found", 404);
    const index = findScheduledItemIndex(todo.items as any[], itemKey);
    if (index < 0) throw new AppError("Scheduled task not found", 404);
    if (!(todo.items as any[])[index])
      throw new AppError("Scheduled task not found", 404);

    (todo.items as any[]).splice(index, 1);
    if ((todo.items as any[]).length === 0 && !todo.checkins?.length) {
      await DailyTodo.deleteOne({ _id: todo._id });
    } else {
      await todo.save();
    }

    res.json(successResponse(null, "Scheduled task deleted"));
  },
);

export const listTodosController = asyncHandler(
  async (req: Request, res: Response) => {
    const { employeeId, date, month, week } = req.query as {
      employeeId?: string;
      date?: string;
      month?: string;
      week?: string;
    };
    const filter: Record<string, any> = {};
    if (employeeId) {
      filter.employeeId = employeeId;
    } else {
      const allowedUsers = await User.find({
        role: { $nin: ["SUPER_ADMIN", "ADMIN"] as any[] },
      })
        .select("employeeId")
        .lean();
      filter.employeeId = { $in: allowedUsers.map((u) => u.employeeId) };
    }

    if (date) {
      filter.date = date;
    } else if (month) {
      filter.date = { $regex: `^${month}` };
    } else if (week) {
      const [yearStr, weekStr] = (week as string).split("-W");
      const year = parseInt(yearStr, 10);
      const weekNum = parseInt(weekStr, 10);

      const simple = new Date(year, 0, 1 + (weekNum - 1) * 7);
      const dow = simple.getDay();
      const ISOweekStart = simple;
      if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
      else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

      const startDate = ISOweekStart.toISOString().split("T")[0];
      const endDateDate = new Date(
        ISOweekStart.getTime() + 6 * 24 * 60 * 60 * 1000,
      );
      const endDate = endDateDate.toISOString().split("T")[0];

      filter.date = { $gte: startDate, $lte: endDate };
    }

    const todos = await DailyTodo.find(filter)
      .sort({ date: -1 })
      .limit(1000)
      .lean();
    res.json(successResponse(todos, "Todos fetched"));
  },
);
