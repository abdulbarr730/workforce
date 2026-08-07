import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { User } from "../../users/model/user.model";
import { DailyTodo as Todo } from "../model/daily-todo.model";
import { EodReport as Eod } from "../model/eod-report.model";
import { buildTextListDiff } from "../../notifications/services/admin-notification.service";

export const getRecentEditsController = asyncHandler(
  async (req: Request, res: Response) => {
    // Fetch all active employees to map names
    const users = await User.find({
      isActive: true,
      role: { $nin: ["SUPER_ADMIN", "ADMIN"] as any[] },
    }).lean();

    const userMap = new Map(users.map((u) => [u.employeeId, u.name]));

    // Find todos that have non-empty todoHistory
    const editedTodos = await Todo.find({
      $and: [
        { todoHistory: { $exists: true } },
        { todoHistory: { $not: { $size: 0 } } },
      ],
    })
      .sort({ "todoHistory.editedAt": -1 })
      .limit(50)
      .lean();

    // Find eods that have non-empty eodHistory
    const editedEods = await Eod.find({
      $and: [
        { eodHistory: { $exists: true } },
        { eodHistory: { $not: { $size: 0 } } },
      ],
    })
      .sort({ "eodHistory.editedAt": -1 })
      .limit(50)
      .lean();

    // Flatten and combine edits
    let allEdits: any[] = [];

    editedTodos.forEach((todo: any) => {
      if (todo.todoHistory && todo.todoHistory.length > 0) {
        todo.todoHistory.forEach((hist: any) => {
          const beforeItems = hist.beforeItems;
          const afterItems = hist.afterItems || hist.items || [];
          allEdits.push({
            id: `${todo._id}-todo-${hist.editedAt}`,
            employeeId: todo.employeeId,
            employeeName: userMap.get(todo.employeeId) || todo.employeeId,
            type: "TODO",
            date: todo.date,
            editedAt: hist.editedAt,
            reason: hist.reason,
            details: hist.items?.map((i: any) => i.text).join(", ") || "",
            diff: beforeItems
              ? buildTextListDiff(beforeItems, afterItems)
              : null,
            deepLink: `/dashboard/daily-reports?employeeId=${encodeURIComponent(todo.employeeId)}&date=${todo.date}`,
          });
        });
      }
    });

    editedEods.forEach((eod: any) => {
      if (eod.eodHistory && eod.eodHistory.length > 0) {
        eod.eodHistory.forEach((hist: any) => {
          const beforeItems = hist.beforeSnapshot?.tasksWithTimings?.length
            ? hist.beforeSnapshot.tasksWithTimings
            : hist.beforeSnapshot?.completedItems;
          const afterItems = hist.afterSnapshot?.tasksWithTimings?.length
            ? hist.afterSnapshot.tasksWithTimings
            : hist.afterSnapshot?.completedItems || hist.completedItems || [];
          allEdits.push({
            id: `${eod._id}-eod-${hist.editedAt}`,
            employeeId: eod.employeeId,
            employeeName: userMap.get(eod.employeeId) || eod.employeeId,
            type: "EOD",
            date: eod.date,
            editedAt: hist.editedAt,
            reason: hist.reason,
            details: hist.summary || "",
            diff: beforeItems
              ? buildTextListDiff(beforeItems, afterItems)
              : null,
            deepLink: `/dashboard/daily-reports?employeeId=${encodeURIComponent(eod.employeeId)}&date=${eod.date}`,
          });
        });
      }
    });

    // Sort combined edits by editedAt descending
    allEdits.sort(
      (a, b) => new Date(b.editedAt).getTime() - new Date(a.editedAt).getTime(),
    );

    // Return the top 20 recent edits
    const recentEdits = allEdits.slice(0, 20);

    return res.json(
      successResponse(recentEdits, "Recent edits fetched successfully"),
    );
  },
);
