import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { DailyTodo } from "../model/daily-todo.model";
import { User } from "../../users/model/user.model";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export const submitMyTodoController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);

    const { items } = req.body as {
      items: Array<{ text: string; done?: boolean }>;
    };
    if (!Array.isArray(items) || items.length === 0)
      throw new AppError("At least one todo item is required", 400);

    const date = todayStr();
    const cleaned = items
      .map((i) => ({
        text: String(i.text || "").trim(),
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

    res.json(successResponse(todo, "Todo saved"));
  },
);

export const getMyTodoTodayController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = (req.user as any)?.employeeId;
    if (!employeeId) throw new AppError("Unauthorized", 401);
    const todo = await DailyTodo.findOne({
      employeeId,
      date: todayStr(),
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
