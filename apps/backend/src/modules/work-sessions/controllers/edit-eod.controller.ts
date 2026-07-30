import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse, errorResponse } from "../../../shared/utils/api-response";
import { EodReport } from "../../daily-flow/model/eod-report.model";
import { WorkSession } from "../model/work-session.model";

export const editEodController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { eodReport, reason, completedItems, top3Tasks } = req.body;
    const user = (req as any).user;

    const session = await WorkSession.findOne({ _id: id, employeeId: user.employeeId }).lean();
    if (!session) {
      return res.status(404).json(errorResponse("Session not found"));
    }

    const dateStr = session.loginAt.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];
    const isToday = todayStr === dateStr;

    let eod = await EodReport.findOne({ employeeId: user.employeeId, date: dateStr });

    if (!eod) {
      eod = new EodReport({
        employeeId: user.employeeId,
        date: dateStr,
        summary: "",
      });
    }

    if (isToday) {
      eod.summary = eodReport;
      if (completedItems) eod.completedItems = completedItems;
      if (top3Tasks) eod.top3Tasks = top3Tasks;
    } else {
      if (eod.isMissedEod) {
        return res.status(400).json(errorResponse("Missed EODs can only be filled once and cannot be edited again."));
      }

      const wasEmpty = !eod.summary || eod.summary.trim() === "";

      if (wasEmpty) {
        eod.isMissedEod = true;
        eod.summary = eodReport;
        if (completedItems) eod.completedItems = completedItems;
        if (top3Tasks) eod.top3Tasks = top3Tasks;
        eod.eodHistory.push({
          summary: eodReport,
          completedItems: completedItems || [],
          reason: "Missed EOD",
          editedAt: new Date()
        });
      } else {
        if (!reason) {
          return res.status(400).json(errorResponse("Reason is required to edit past EODs."));
        }
        if (eod.eodEditCount >= 1) {
          return res.status(400).json(errorResponse("Maximum edit limit (1) reached for this EOD."));
        }
        
        eod.eodEditCount += 1;
        eod.summary = eodReport;
        if (completedItems) eod.completedItems = completedItems;
        if (top3Tasks) eod.top3Tasks = top3Tasks;
        eod.eodHistory.push({
          summary: eodReport,
          completedItems: completedItems || [],
          reason,
          editedAt: new Date()
        });
      }
    }

    await eod.save();

    return res.json(
      successResponse(eod, "EOD updated successfully")
    );
  }
);
