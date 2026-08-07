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
      }>;
      date?: string;
    };
    if (!Array.isArray(items) || items.length === 0)
      throw new AppError("At least one todo item is required", 400);

    const today = todayStr();
    let date = today;
    if (bodyDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bodyDate))
        throw new AppError("Invalid date format. Use YYYY-MM-DD", 400);
      if (bodyDate > today)
        throw new AppError("Cannot backfill future dates", 400);
      date = bodyDate;
    }

    const cleaned = items
      .map((i) => ({
        text: String(i.text || "").trim(),
        timeTaken: String(i.timeTaken || i.estimatedTime || "").trim(),
        estimatedTime: String(i.estimatedTime || i.timeTaken || "").trim(),
        isTopTask: Boolean(i.isTopTask),
        done: Boolean(i.done),
      }))
      .filter((i) => i.text.length > 0);

    if (cleaned.length === 0)
      throw new AppError("Todo items cannot be empty", 400);

    const todo = await DailyTodo.findOneAndUpdate(
      { employeeId, date },
      { $set: { items: cleaned } },
      { upsert: true, returnDocument: "after" },
    );

    // Fetch user name and emit notification
    try {
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
