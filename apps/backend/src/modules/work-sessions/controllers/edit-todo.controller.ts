import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/api-response";
import { DailyTodo } from "../../daily-flow/model/daily-todo.model";
import { WorkSession } from "../model/work-session.model";
import {
  buildTextListDiff,
  createAdminAuditNotification,
} from "../../notifications/services/admin-notification.service";

export const editTodoController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params; // this is the WorkSession ID
    const { todoList = [], todoItems, reason } = req.body;
    const user = (req as any).user;

    const session = await WorkSession.findOne({
      _id: id,
      employeeId: user.employeeId,
    }).lean();
    if (!session) {
      return res.status(404).json(errorResponse("Session not found"));
    }

    const dateStr = session.loginAt.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];
    const isToday = todayStr === dateStr;

    let todo = await DailyTodo.findOne({
      employeeId: user.employeeId,
      date: dateStr,
    });

    if (!todo) {
      todo = new DailyTodo({
        employeeId: user.employeeId,
        date: dateStr,
        items: [],
      });
    }

    const sourceItems = Array.isArray(todoItems) ? todoItems : todoList;
    if (!Array.isArray(sourceItems)) {
      return res
        .status(400)
        .json(errorResponse("A valid TODO list is required."));
    }
    const mappedItems = sourceItems
      .map((item: any) => ({
        text: String(item?.text ?? item ?? "").trim(),
        timeTaken: String(item?.timeTaken ?? ""),
        estimatedTime: String(item?.estimatedTime ?? ""),
        isTopTask: Boolean(item?.isTopTask),
        done: Boolean(item?.done),
      }))
      .filter((item: any) => item.text);
    const beforeItems = JSON.parse(JSON.stringify(todo.items || []));
    const wasEmpty = beforeItems.length === 0;
    const editReason = String(reason || "").trim();

    if (!wasEmpty && !editReason) {
      return res
        .status(400)
        .json(errorResponse("Reason is required to edit a TODO."));
    }

    if (isToday) {
      todo.set("items", mappedItems);
      todo.todoHistory.push({
        items: mappedItems,
        beforeItems,
        afterItems: mappedItems,
        reason: wasEmpty ? "Initial Todo entry" : editReason,
        editedAt: new Date(),
      });
    } else {
      if (todo.isMissedTodo) {
        return res
          .status(400)
          .json(
            errorResponse(
              "Missed TODOs can only be filled once and cannot be edited again.",
            ),
          );
      }

      if (wasEmpty) {
        todo.isMissedTodo = true;
        todo.set("items", mappedItems);
        todo.todoHistory.push({
          items: mappedItems,
          beforeItems,
          afterItems: mappedItems,
          reason: "Missed Todo",
          editedAt: new Date(),
        });
      } else {
        if (todo.todoEditCount >= 1) {
          return res
            .status(400)
            .json(
              errorResponse("Maximum edit limit (1) reached for this TODO."),
            );
        }

        todo.todoEditCount += 1;
        todo.set("items", mappedItems);
        todo.todoHistory.push({
          items: mappedItems,
          beforeItems,
          afterItems: mappedItems,
          reason: editReason,
          editedAt: new Date(),
        });
      }
    }

    await todo.save();

    const finalReason = wasEmpty
      ? isToday
        ? "Initial Todo entry"
        : "Missed Todo"
      : editReason;
    await createAdminAuditNotification({
      kind: "TODO_EDITED",
      title: wasEmpty ? "Todo added" : "Todo edited",
      message: `${user.name || user.employeeId} ${wasEmpty ? "added" : "edited"} the Todo for ${dateStr}.`,
      employeeId: user.employeeId,
      employeeName: user.name || user.employeeId,
      entityType: "TODO",
      entityId: String(todo._id),
      entityDate: dateStr,
      reason: finalReason,
      before: { items: beforeItems },
      after: { items: mappedItems },
      diff: buildTextListDiff(beforeItems, mappedItems),
      deepLink: `/dashboard/daily-reports?employeeId=${encodeURIComponent(user.employeeId)}&date=${dateStr}`,
      changedBy: {
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
      },
    });

    return res.json(successResponse(todo, "TODO updated successfully"));
  },
);
