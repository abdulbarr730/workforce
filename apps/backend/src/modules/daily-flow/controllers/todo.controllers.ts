import { Request, Response } from "express";
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
    res.json(successResponse(todo, todo ? "Todo found" : "No todo for today"));
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
          id: `${todo._id}:${index}:${item.text}:${item.deadlineAt}`,
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
        id: `${todo._id}:${index}:${item.text}`,
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
    const todos = await DailyTodo.find({
      employeeId,
      $or: [
        { date: { $gte: today } },
        { "items.deadlineAt": { $ne: null } },
        { "items.reminderAt": { $ne: null } },
      ],
    })
      .sort({ date: 1 })
      .limit(120)
      .lean();

    const tasks = todos
      .flatMap((todo: any) =>
        (todo.items || []).map((item: any, index: number) => ({
          id: `${todo._id}:${index}`,
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

export const updateMyScheduledTodoController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const { todoId, itemIndex } = req.params as {
      todoId: string;
      itemIndex: string;
    };
    const index = Number(itemIndex);
    if (!Number.isInteger(index) || index < 0)
      throw new AppError("Invalid scheduled task index", 400);

    const todo = await DailyTodo.findOne({ _id: todoId, employeeId });
    if (!todo) throw new AppError("Scheduled task not found", 404);
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

    const targetDate =
      scheduledFor && /^\d{4}-\d{2}-\d{2}$/.test(String(scheduledFor))
        ? String(scheduledFor)
        : todo.date;

    const updatedItem = {
      text: String(text ?? current.text ?? "").trim(),
      timeTaken: String(estimatedTime ?? current.estimatedTime ?? current.timeTaken ?? "").trim(),
      estimatedTime: String(estimatedTime ?? current.estimatedTime ?? current.timeTaken ?? "").trim(),
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

    (todo.items as any[]).splice(index, 1);
    await todo.save();

    if (targetDate !== todo.date) {
      await DailyTodo.findOneAndUpdate(
        { employeeId, date: targetDate },
        { $push: { items: updatedItem } },
        { upsert: true, returnDocument: "after" },
      );
      if ((todo.items as any[]).length === 0 && !todo.checkins?.length) {
        await DailyTodo.deleteOne({ _id: todo._id });
      }
    } else {
      (todo.items as any[]).splice(index, 0, updatedItem);
      await todo.save();
    }

    res.json(successResponse(null, "Scheduled task updated"));
  },
);

export const deleteMyScheduledTodoController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const { todoId, itemIndex } = req.params as {
      todoId: string;
      itemIndex: string;
    };
    const index = Number(itemIndex);
    if (!Number.isInteger(index) || index < 0)
      throw new AppError("Invalid scheduled task index", 400);

    const todo = await DailyTodo.findOne({ _id: todoId, employeeId });
    if (!todo) throw new AppError("Scheduled task not found", 404);
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
