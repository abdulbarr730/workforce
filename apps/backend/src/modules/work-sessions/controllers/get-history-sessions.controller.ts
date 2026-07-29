import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { DailyTodo } from "../../daily-flow/model/daily-todo.model";
import { EodReport } from "../../daily-flow/model/eod-report.model";
import { WorkSession } from "../model/work-session.model";

export const getHistorySessionsController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    
    // Fetch last 30 sessions for basic date and login context
    const sessions = await WorkSession.find({
      employeeId: user.employeeId,
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const dates = sessions.map(s => {
      const loginDate = s.loginAt || s.createdAt || new Date();
      return new Date(loginDate).toISOString().split("T")[0];
    });

    const todos = await DailyTodo.find({
      employeeId: user.employeeId,
      date: { $in: dates }
    }).lean();

    const eods = await EodReport.find({
      employeeId: user.employeeId,
      date: { $in: dates }
    }).lean();

    const combinedHistory = sessions.map(session => {
      const loginDate = session.loginAt || session.createdAt || new Date();
      const dateStr = new Date(loginDate).toISOString().split("T")[0];
      const todo = todos.find(t => t.date === dateStr);
      const eod = eods.find(e => e.date === dateStr);

      return {
        _id: session._id,
        loginAt: new Date(loginDate).toISOString(),
        todoId: todo?._id,
        todoList: todo?.items?.map((i: any) => i.text) || [],
        todoEditCount: todo?.todoEditCount || 0,
        isMissedTodo: todo?.isMissedTodo || false,
        eodId: eod?._id,
        eodReport: eod?.summary || "",
        eodEditCount: eod?.eodEditCount || 0,
        isMissedEod: eod?.isMissedEod || false,
        date: dateStr
      };
    });

    return res.json(
      successResponse(combinedHistory, "History sessions fetched successfully")
    );
  }
);
