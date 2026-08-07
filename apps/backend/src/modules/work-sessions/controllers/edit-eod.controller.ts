import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/api-response";
import { EodReport } from "../../daily-flow/model/eod-report.model";
import { WorkSession } from "../model/work-session.model";
import {
  addChangedFields,
  buildTextListDiff,
  createAdminAuditNotification,
} from "../../notifications/services/admin-notification.service";

export const editEodController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { eodReport, reason, completedItems, tasksWithTimings, top3Tasks } =
      req.body;
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

    let eod = await EodReport.findOne({
      employeeId: user.employeeId,
      date: dateStr,
    });

    if (!eod) {
      eod = new EodReport({
        employeeId: user.employeeId,
        date: dateStr,
        summary: "",
      });
    }

    const beforeSnapshot = {
      summary: eod.summary || "",
      completedItems: JSON.parse(JSON.stringify(eod.completedItems || [])),
      tasksWithTimings: JSON.parse(JSON.stringify(eod.tasksWithTimings || [])),
      top3Tasks: JSON.parse(JSON.stringify(eod.top3Tasks || [])),
      blockers: eod.blockers || "",
      hoursWorked: eod.hoursWorked ?? null,
    };
    const wasEmpty = !beforeSnapshot.summary.trim();
    const editReason = String(reason || "").trim();

    if (!wasEmpty && !editReason) {
      return res
        .status(400)
        .json(errorResponse("Reason is required to edit an EOD."));
    }

    if (isToday) {
      eod.summary = eodReport;
      if (completedItems) eod.completedItems = completedItems;
      if (tasksWithTimings) eod.tasksWithTimings = tasksWithTimings;
      if (top3Tasks) eod.top3Tasks = top3Tasks;
      const afterSnapshot = {
        summary: eod.summary,
        completedItems: JSON.parse(JSON.stringify(eod.completedItems || [])),
        tasksWithTimings: JSON.parse(
          JSON.stringify(eod.tasksWithTimings || []),
        ),
        top3Tasks: JSON.parse(JSON.stringify(eod.top3Tasks || [])),
        blockers: eod.blockers || "",
        hoursWorked: eod.hoursWorked ?? null,
      };
      eod.eodHistory.push({
        summary: eod.summary,
        completedItems: eod.completedItems,
        beforeSnapshot,
        afterSnapshot,
        reason: wasEmpty ? "Initial EOD entry" : editReason,
        editedAt: new Date(),
      });
    } else {
      if (eod.isMissedEod) {
        return res
          .status(400)
          .json(
            errorResponse(
              "Missed EODs can only be filled once and cannot be edited again.",
            ),
          );
      }

      if (wasEmpty) {
        eod.isMissedEod = true;
        eod.summary = eodReport;
        if (completedItems) eod.completedItems = completedItems;
        if (tasksWithTimings) eod.tasksWithTimings = tasksWithTimings;
        if (top3Tasks) eod.top3Tasks = top3Tasks;
        eod.eodHistory.push({
          summary: eodReport,
          completedItems: completedItems || [],
          beforeSnapshot,
          afterSnapshot: {
            summary: eod.summary,
            completedItems: JSON.parse(
              JSON.stringify(eod.completedItems || []),
            ),
            tasksWithTimings: JSON.parse(
              JSON.stringify(eod.tasksWithTimings || []),
            ),
            top3Tasks: JSON.parse(JSON.stringify(eod.top3Tasks || [])),
            blockers: eod.blockers || "",
            hoursWorked: eod.hoursWorked ?? null,
          },
          reason: "Missed EOD",
          editedAt: new Date(),
        });
      } else {
        if (eod.eodEditCount >= 1) {
          return res
            .status(400)
            .json(
              errorResponse("Maximum edit limit (1) reached for this EOD."),
            );
        }

        eod.eodEditCount += 1;
        eod.summary = eodReport;
        if (completedItems) eod.completedItems = completedItems;
        if (tasksWithTimings) eod.tasksWithTimings = tasksWithTimings;
        if (top3Tasks) eod.top3Tasks = top3Tasks;
        eod.eodHistory.push({
          summary: eodReport,
          completedItems: completedItems || [],
          beforeSnapshot,
          afterSnapshot: {
            summary: eod.summary,
            completedItems: JSON.parse(
              JSON.stringify(eod.completedItems || []),
            ),
            tasksWithTimings: JSON.parse(
              JSON.stringify(eod.tasksWithTimings || []),
            ),
            top3Tasks: JSON.parse(JSON.stringify(eod.top3Tasks || [])),
            blockers: eod.blockers || "",
            hoursWorked: eod.hoursWorked ?? null,
          },
          reason: editReason,
          editedAt: new Date(),
        });
      }
    }

    await eod.save();

    const afterSnapshot = {
      summary: eod.summary || "",
      completedItems: JSON.parse(JSON.stringify(eod.completedItems || [])),
      tasksWithTimings: JSON.parse(JSON.stringify(eod.tasksWithTimings || [])),
      top3Tasks: JSON.parse(JSON.stringify(eod.top3Tasks || [])),
      blockers: eod.blockers || "",
      hoursWorked: eod.hoursWorked ?? null,
    };
    const beforeTasks = beforeSnapshot.tasksWithTimings.length
      ? beforeSnapshot.tasksWithTimings
      : beforeSnapshot.completedItems;
    const afterTasks = afterSnapshot.tasksWithTimings.length
      ? afterSnapshot.tasksWithTimings
      : afterSnapshot.completedItems;
    const diff = addChangedFields(
      buildTextListDiff(beforeTasks, afterTasks),
      beforeSnapshot,
      afterSnapshot,
      ["summary", "tasksWithTimings", "top3Tasks", "blockers", "hoursWorked"],
    );
    const finalReason = wasEmpty
      ? isToday
        ? "Initial EOD entry"
        : "Missed EOD"
      : editReason;
    await createAdminAuditNotification({
      kind: "EOD_EDITED",
      title: wasEmpty ? "EOD added" : "EOD edited",
      message: `${user.name || user.employeeId} ${wasEmpty ? "added" : "edited"} the EOD for ${dateStr}.`,
      employeeId: user.employeeId,
      employeeName: user.name || user.employeeId,
      entityType: "EOD",
      entityId: String(eod._id),
      entityDate: dateStr,
      reason: finalReason,
      before: beforeSnapshot,
      after: afterSnapshot,
      diff,
      deepLink: `/dashboard/daily-reports?employeeId=${encodeURIComponent(user.employeeId)}&date=${dateStr}`,
      changedBy: {
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
      },
    });

    return res.json(successResponse(eod, "EOD updated successfully"));
  },
);
