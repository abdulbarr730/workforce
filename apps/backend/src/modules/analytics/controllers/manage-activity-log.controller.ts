import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import {
  errorResponse,
  successResponse,
} from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ActivityEvent } from "../../tracking/model/activity-event.model";

const editableTypes = new Set(["IDLE_RESPONSE", "BREAK_END", "AWAY_WORK_END"]);

const readReason = (metadata: any) =>
  String(metadata?.reason || metadata?.comment || "").trim();

export const updateActivityLogController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim();
    const correctionComment = String(req.body?.correctionComment || "").trim();

    if (!reason) {
      res.status(400).json(errorResponse("Employee comment is required"));
      return;
    }

    if (correctionComment.length < 5) {
      res
        .status(400)
        .json(errorResponse("Super Admin correction comment is required"));
      return;
    }

    const event = await ActivityEvent.findById(id);
    if (!event || event.invalidated) {
      res.status(404).json(errorResponse("Activity log not found"));
      return;
    }

    if (!editableTypes.has(event.type)) {
      res
        .status(400)
        .json(errorResponse("Only break/offline log comments can be edited"));
      return;
    }

    const metadata = { ...((event.metadata as any) || {}) };
    const beforeReason = readReason(metadata);
    metadata.reason = reason;
    metadata.editedBySuperAdmin = {
      employeeId: req.user?.employeeId || "",
      name: req.user?.name || "",
      editedAt: new Date().toISOString(),
      correctionComment,
      beforeReason,
      afterReason: reason,
    };

    event.metadata = metadata;
    await event.save();

    res.json(successResponse(event, "Activity log comment updated"));
  },
);

export const deleteActivityLogController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const correctionComment = String(req.body?.correctionComment || "").trim();

    if (correctionComment.length < 5) {
      res
        .status(400)
        .json(errorResponse("Super Admin deletion comment is required"));
      return;
    }

    const event = await ActivityEvent.findById(id);
    if (!event || event.invalidated) {
      res.status(404).json(errorResponse("Activity log not found"));
      return;
    }

    if (!editableTypes.has(event.type)) {
      res
        .status(400)
        .json(errorResponse("Only break/offline logs can be deleted"));
      return;
    }

    const metadata = { ...((event.metadata as any) || {}) };
    metadata.invalidatedBySuperAdmin = {
      employeeId: req.user?.employeeId || "",
      name: req.user?.name || "",
      invalidatedAt: new Date().toISOString(),
      correctionComment,
      previousReason: readReason(metadata),
    };

    event.metadata = metadata;
    event.invalidated = true;
    await event.save();

    res.json(successResponse({ id }, "Activity log deleted from analytics"));
  },
);
