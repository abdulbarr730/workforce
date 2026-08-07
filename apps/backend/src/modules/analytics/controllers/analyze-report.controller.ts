import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/api-response";
import {
  OpenRouterRequestError,
  requestOpenRouterCompletion,
} from "../services/openrouter.service";

export const analyzeReportController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { reportData } = req.body;

    if (!reportData) {
      res.status(400).json(errorResponse("reportData is required"));
      return;
    }

    const aiPayload = {
      overview: reportData.overview,
      topProductiveApps: reportData.topProductiveApps,
      topUnproductiveApps: reportData.topUnproductiveApps,
      needsAttention: reportData.needsAttention,
      latecomers: reportData.latecomers,
      employeeList: (reportData.employeeList || []).map((employee: any) => ({
        name: employee.name,
        productiveHours: employee.productiveHours,
        unproductiveHours: employee.unproductiveHours,
        lateDays: employee.lateDays,
      })),
    };

    const prompt = `You are an expert workforce operations analyst. Analyze the supplied report using only the evidence in the JSON.
Write a concise professional Markdown summary with specific anomalies, application trends, data gaps, and items a manager should verify. Never recommend hiring, firing, promotion, compensation, or discipline. Do not invent facts.

Report data:
${JSON.stringify(aiPayload, null, 2)}`;

    try {
      const result = await requestOpenRouterCompletion({
        messages: [{ role: "user", content: prompt }],
        maxCompletionTokens: 1_400,
      });
      res
        .status(200)
        .json(
          successResponse(
            { summary: result.content, model: result.model },
            "AI Analysis generated",
          ),
        );
    } catch (error) {
      const statusCode =
        error instanceof OpenRouterRequestError ? error.statusCode : 502;
      const message =
        error instanceof Error
          ? error.message
          : "AI Analysis generation failed.";
      res.status(statusCode).json(errorResponse(message));
    }
  },
);
