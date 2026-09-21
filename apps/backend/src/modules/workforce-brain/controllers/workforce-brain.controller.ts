import { Response } from "express";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import {
  checkAndRunPeriodicMemoryRevision,
  getWorkforceBrainContext,
  getWorkforceBrainStatus,
  trainWorkforceBrain,
} from "../services/workforce-brain.service";
import {
  classifyOrGetAppKnowledge,
  inferEmployeeActivityContext,
} from "../services/app-activity-classifier.service";
import { AppKnowledge } from "../model/app-knowledge.model";
import { Department } from "../../departments/model/department.model";

export const trainWorkforceBrainController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const result = await trainWorkforceBrain({
      employeeId: req.body?.employeeId
        ? String(req.body.employeeId)
        : undefined,
      departmentId: req.body?.departmentId
        ? String(req.body.departmentId)
        : undefined,
      days: req.body?.days ? Number(req.body.days) : 60,
      includeClaude: req.body?.includeClaude !== false,
    });

    res.json(successResponse(result, result.message));
  },
);

export const getWorkforceBrainStatusController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId = req.query.employeeId
      ? String(req.query.employeeId)
      : undefined;
    const result = await getWorkforceBrainStatus(employeeId);
    res.json(successResponse(result, "Workforce brain status fetched"));
  },
);

export const getWorkforceBrainContextController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const employeeId =
      req.query.employeeId || (req.user as any)?.employeeId || "";
    const result = await getWorkforceBrainContext(String(employeeId));
    res.json(successResponse(result, "Workforce brain context fetched"));
  },
);

export const getAppKnowledgeController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const apps = await AppKnowledge.find().sort({ appName: 1 }).lean();
    res.json(successResponse(apps, "App knowledge fetched"));
  },
);

export const classifyAppController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { app, domain, title, url } = req.body || {};
    const result = await classifyOrGetAppKnowledge({ app, domain, title, url });
    res.json(successResponse(result, "App classified successfully"));
  },
);

export const inferActivityController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { employeeId, app, domain, title, url } = req.body || {};
    const result = await inferEmployeeActivityContext({
      employeeId,
      app,
      domain,
      title,
      url,
    });
    res.json(successResponse(result, "Activity inferred successfully"));
  },
);

export const reviseMemoryController = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const result = await checkAndRunPeriodicMemoryRevision();
    res.json(successResponse(result, result.message));
  },
);

export const updateDepartmentResponsibilitiesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { departmentId, responsibilities, primaryTools, appWorkflows, kbNotes } =
      req.body || {};

    if (!departmentId) {
      res.status(400).json({ success: false, message: "departmentId is required" });
      return;
    }

    const updateFields: Record<string, unknown> = {};
    if ("responsibilities" in (req.body || {})) {
      updateFields.responsibilities = Array.isArray(responsibilities)
        ? responsibilities.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    }
    if ("primaryTools" in (req.body || {})) {
      updateFields.primaryTools = Array.isArray(primaryTools)
        ? primaryTools.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    }
    if ("appWorkflows" in (req.body || {})) {
      updateFields.appWorkflows = Array.isArray(appWorkflows)
        ? appWorkflows
            .map((workflow) => ({
              app: String(workflow?.app || "").trim(),
              pairedApp: String(workflow?.pairedApp || "").trim(),
              description: String(workflow?.description || "").trim(),
            }))
            .filter((workflow) => workflow.app && workflow.description)
        : [];
    }
    if ("kbNotes" in (req.body || {})) {
      updateFields.kbNotes = String(kbNotes || "").trim();
    }

    const updated = await Department.findByIdAndUpdate(
      departmentId,
      { $set: updateFields },
      { new: true },
    ).lean();

    if (!updated) {
      res.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    res.json(successResponse(updated, "Department responsibilities updated"));
  },
);
