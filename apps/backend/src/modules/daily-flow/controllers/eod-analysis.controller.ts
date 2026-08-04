import { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { runDailyFlowAnalysisEngine } from "../services/eod-analysis-engine.service";

export const getDailyFlowAnalysisController = asyncHandler(
  async (req: Request, res: Response) => {
    const { date, employeeId } = req.query as {
      date?: string;
      employeeId?: string;
    };
    const report = await runDailyFlowAnalysisEngine(date, employeeId);
    res.json(successResponse(report, "Daily flow analysis report fetched successfully"));
  },
);

export const generateDailyFlowAnalysisController = asyncHandler(
  async (req: Request, res: Response) => {
    const { date, employeeId } = req.body as {
      date?: string;
      employeeId?: string;
    };
    const report = await runDailyFlowAnalysisEngine(date, employeeId);
    res.json(successResponse(report, "Daily flow analysis report generated successfully"));
  },
);
