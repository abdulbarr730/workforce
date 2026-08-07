import { Response } from "express";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { asyncHandler } from "../../../shared/utils/async-handler";
import {
  errorResponse,
  successResponse,
} from "../../../shared/utils/api-response";
import {
  EmployeeAiAuditReport,
  generateEmployeeAiAudit,
} from "../services/employee-ai-audit.service";
import { createEmployeeAiAuditWorkbook } from "../services/employee-ai-audit-workbook.service";
import { createTodoEodArchive } from "../services/todo-eod-archive.service";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const validateRange = (startDate: unknown, endDate: unknown) => {
  if (
    typeof startDate !== "string" ||
    typeof endDate !== "string" ||
    !DATE_PATTERN.test(startDate) ||
    !DATE_PATTERN.test(endDate)
  ) {
    return "startDate and endDate are required in YYYY-MM-DD format.";
  }

  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "The report end date must be on or after the start date.";
  }
  if ((end - start) / 86_400_000 > 92) {
    return "Reports are limited to a maximum 93-day range.";
  }

  return null;
};

export const employeeAiAuditController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { startDate, endDate, employeeId, includeAi } = req.body;
    const validationError = validateRange(startDate, endDate);
    if (validationError) {
      res.status(400).json(errorResponse(validationError));
      return;
    }

    const report = await generateEmployeeAiAudit({
      startDate,
      endDate,
      employeeId:
        typeof employeeId === "string" && employeeId !== "ALL"
          ? employeeId
          : undefined,
      includeAi: includeAi !== false,
    });

    res
      .status(200)
      .json(successResponse(report, "Per-employee AI audit generated."));
  },
);

export const exportEmployeeAiAuditController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const report = req.body?.report as EmployeeAiAuditReport | undefined;
    if (
      !report ||
      report.schemaVersion !== 1 ||
      !report.dateRange ||
      !Array.isArray(report.employees)
    ) {
      res
        .status(400)
        .json(errorResponse("A generated AI audit report is required."));
      return;
    }

    const workbook = await createEmployeeAiAuditWorkbook(report);
    const filename = `Employee_AI_Audit_${report.dateRange.startDate}_to_${report.dateRange.endDate}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(workbook);
  },
);

export const exportTodoEodArchiveController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { startDate, endDate, employeeId } = req.body;
    const validationError = validateRange(startDate, endDate);
    if (validationError) {
      res.status(400).json(errorResponse(validationError));
      return;
    }

    const archive = await createTodoEodArchive({
      startDate,
      endDate,
      employeeId:
        typeof employeeId === "string" && employeeId !== "ALL"
          ? employeeId
          : undefined,
    });
    const filename = `Todo_EOD_Reports_${startDate}_to_${endDate}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Employee-Count", String(archive.employeeCount));
    res.setHeader("X-Todo-Item-Count", String(archive.todoItemCount));
    res.setHeader("X-EOD-Task-Count", String(archive.eodTaskCount));
    res.status(200).send(archive.buffer);
  },
);
