import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import {
  errorResponse,
  successResponse,
} from "../../../shared/utils/api-response";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { invalidateLiveStatsCache } from "./get-live-stats.controller";

const editableTypes = new Set(["IDLE_RESPONSE", "BREAK_END", "AWAY_WORK_END"]);

const readReason = (metadata: any) =>
  String(metadata?.reason || metadata?.comment || "").trim();

const readDate = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const readSeconds = (value: unknown) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.round(seconds)
    : null;
};

export const updateActivityLogController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim();
    const correctionComment = String(req.body?.correctionComment || "").trim();
    const startAt = readDate(req.body?.startAt);
    const endAt = readDate(req.body?.endAt);
    const explicitDurationSeconds = readSeconds(req.body?.durationSeconds);

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
    const beforeTiming = {
      timestamp: event.timestamp,
      startedAt: metadata.startedAt || null,
      from: metadata.from || null,
      to: metadata.to || null,
      durationSeconds:
        metadata.durationSeconds || metadata.idleSeconds || null,
      durationMinutes: metadata.durationMinutes || metadata.idleMinutes || null,
    };
    metadata.reason = reason;

    const computedDurationSeconds =
      startAt && endAt
        ? Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / 1000))
        : explicitDurationSeconds;

    if (event.type === "IDLE_RESPONSE") {
      if (startAt) metadata.from = startAt.toISOString();
      if (endAt) {
        metadata.to = endAt.toISOString();
        event.timestamp = endAt;
      }
      if (computedDurationSeconds) {
        metadata.idleSeconds = computedDurationSeconds;
        metadata.durationSeconds = computedDurationSeconds;
        metadata.idleMinutes = Math.max(
          1,
          Math.round(computedDurationSeconds / 60),
        );
      }
    }

    if (event.type === "BREAK_END" || event.type === "AWAY_WORK_END") {
      if (startAt) metadata.startedAt = startAt.toISOString();
      if (endAt) event.timestamp = endAt;
      if (computedDurationSeconds) {
        metadata.durationSeconds = computedDurationSeconds;
        metadata.durationMinutes = Math.max(
          1,
          Math.round(computedDurationSeconds / 60),
        );
      }
    }

    metadata.editedBySuperAdmin = {
      employeeId: req.user?.employeeId || "",
      name: req.user?.name || "",
      editedAt: new Date().toISOString(),
      correctionComment,
      beforeReason,
      afterReason: reason,
      beforeTiming,
      afterTiming: {
        timestamp: event.timestamp,
        startedAt: metadata.startedAt || null,
        from: metadata.from || null,
        to: metadata.to || null,
        durationSeconds:
          metadata.durationSeconds || metadata.idleSeconds || null,
        durationMinutes:
          metadata.durationMinutes || metadata.idleMinutes || null,
      },
    };

    event.metadata = metadata;
    await event.save();
    invalidateLiveStatsCache(String(event.employeeId));

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
    invalidateLiveStatsCache(String(event.employeeId));

    res.json(successResponse({ id }, "Activity log deleted from analytics"));
  },
);
