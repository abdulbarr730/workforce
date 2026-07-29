import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse, errorResponse } from "../../../shared/utils/api-response";
import { DailyTodo } from "../../daily-flow/model/daily-todo.model";
import { WorkSession } from "../model/work-session.model";

export const editTodoController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params; // this is the WorkSession ID
    const { todoList, reason } = req.body;
    const user = (req as any).user;

    const session = await WorkSession.findOne({ _id: id, employeeId: user.employeeId }).lean();
    if (!session) {
      return res.status(404).json(errorResponse("Session not found"));
    }

    const dateStr = session.loginAt.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];
    const isToday = todayStr === dateStr;

    let todo = await DailyTodo.findOne({ employeeId: user.employeeId, date: dateStr });
    
    if (!todo) {
      todo = new DailyTodo({
        employeeId: user.employeeId,
        date: dateStr,
        items: []
      });
    }

    const mappedItems = todoList.map((t: string) => ({ text: t, done: false }));

    if (isToday) {
      todo.items = mappedItems;
    } else {
      if (todo.isMissedTodo) {
        return res.status(400).json(errorResponse("Missed TODOs can only be filled once and cannot be edited again."));
      }

      const wasEmpty = !todo.items || todo.items.length === 0;

      if (wasEmpty) {
        todo.isMissedTodo = true;
        todo.items = mappedItems;
        todo.todoHistory.push({
          items: mappedItems,
          reason: "Missed Todo",
          editedAt: new Date()
        });
      } else {
        if (!reason) {
          return res.status(400).json(errorResponse("Reason is required to edit past TODOs."));
        }
        if (todo.todoEditCount >= 1) {
          return res.status(400).json(errorResponse("Maximum edit limit (1) reached for this TODO."));
        }
        
        todo.todoEditCount += 1;
        todo.items = mappedItems;
        todo.todoHistory.push({
          items: mappedItems,
          reason,
          editedAt: new Date()
        });
      }
    }

    await todo.save();

    return res.json(
      successResponse(todo, "TODO updated successfully")
    );
  }
);
