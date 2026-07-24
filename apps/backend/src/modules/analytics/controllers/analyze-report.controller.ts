import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { successResponse, errorResponse } from "../../../shared/utils/api-response";

const MODELS = [
  "google/gemma-2-9b-it:free",
  "meta-llama/llama-3-8b-instruct:free",
  "mistralai/mistral-7b-instruct:free"
];

export const analyzeReportController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { reportData } = req.body;

    if (!reportData) {
      res.status(400).json(errorResponse("reportData is required"));
      return;
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      res.status(500).json(errorResponse("OPENROUTER_API_KEY is missing from environment variables. Please add it to your .env file."));
      return;
    }

    const prompt = `You are an expert HR and Productivity Analyst. You have been given a JSON payload representing a workforce performance report.
Please write a concise, professional Executive Summary in Markdown format.
Highlight any anomalies, top productive applications, unproductive trends, weekend activity, and explicitly call out individuals who need attention (lates, missing EODs).
Keep it professional, highly readable, and use Markdown features like bolding, lists, and headers. Do not include introductory text like "Here is the summary", just output the raw markdown report.

JSON Report Data:
${JSON.stringify(reportData, null, 2)}
`;

    let summary = "Failed to generate AI analysis. All models failed.";
    let success = false;

    for (const model of MODELS) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://prosynchub.com", // Recommended by OpenRouter
            "X-Title": "Workforce Platform",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }]
          }),
          signal: AbortSignal.timeout(20000)
        });

        if (!response.ok) {
           throw new Error(`OpenRouter API error: ${response.status}`);
        }

        const data = await response.json();

        if (data && data.choices && data.choices.length > 0) {
          summary = data.choices[0].message.content;
          success = true;
          break; // Break the loop if successful
        }
      } catch (error: any) {
        console.error(`[AI Analysis] Model ${model} failed:`, error.message);
        // Continue to the next fallback model
      }
    }

    if (!success) {
      res.status(502).json(errorResponse("AI Analysis generation failed across all fallback models. Check your OpenRouter key or try again later."));
      return;
    }

    res.status(200).json(successResponse({ summary }, "AI Analysis generated"));
  }
);
