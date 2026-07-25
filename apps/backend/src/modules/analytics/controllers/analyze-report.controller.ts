import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { successResponse, errorResponse } from "../../../shared/utils/api-response";
import * as https from "https";

const MODELS = [
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-2-9b-it:free",
  "qwen/qwen-2-7b-instruct:free",
  "microsoft/phi-3-mini-128k-instruct:free",
  "mistralai/mistral-7b-instruct:free"
];

function makeHttpsPostRequest(url: string, apiKey: string, bodyObj: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(bodyObj);
    const options = {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://prosynchub.com",
        "X-Title": "Workforce Platform",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataString)
      },
      timeout: 12000 // 12s timeout to avoid hitting proxy limits (e.g. 60s) with multiple retries
    };

    const req = https.request(url, options, (res) => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          return reject(new Error(`OpenRouter API error: ${res.statusCode} - ${responseBody}`));
        }
        try {
          const parsed = JSON.parse(responseBody);
          resolve(parsed);
        } catch (e: any) {
          reject(new Error("Failed to parse JSON response: " + e.message));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error("Request timed out after 12s"));
    });

    req.write(dataString);
    req.end();
  });
}

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

    // Strip massive arrays (like attendance and shifts) to prevent hitting AI context limits
    const aiPayload = {
      overview: reportData.overview,
      topProductiveApps: reportData.topProductiveApps,
      topUnproductiveApps: reportData.topUnproductiveApps,
      needsAttention: reportData.needsAttention
    };

    const prompt = `You are an expert HR and Productivity Analyst. You have been given a JSON payload representing a workforce performance report.
Please write a concise, professional Executive Summary in Markdown format.
Highlight any anomalies, top productive applications, unproductive trends, weekend activity, and explicitly call out individuals who need attention (lates, missing EODs).
Keep it professional, highly readable, and use Markdown features like bolding, lists, and headers. Do not include introductory text like "Here is the summary", just output the raw markdown report.

JSON Report Data:
${JSON.stringify(aiPayload, null, 2)}
`;

    let summary = "Failed to generate AI analysis. All models failed.";
    let success = false;
    let lastError = "";

    try {
      const promises = MODELS.map(async (model) => {
        const bodyObj = {
          model: model,
          messages: [{ role: "user", content: prompt }]
        };
        const data = await makeHttpsPostRequest("https://openrouter.ai/api/v1/chat/completions", OPENROUTER_API_KEY, bodyObj);
        if (data && data.choices && data.choices.length > 0) {
          return data.choices[0].message.content;
        }
        throw new Error(`Model ${model} returned empty response`);
      });

      // Wait for the FIRST successful response
      summary = await Promise.any(promises);
      success = true;
    } catch (aggregateError: any) {
      if (aggregateError.errors) {
        lastError = aggregateError.errors.map((e: Error) => e.message).join(" | ");
      } else {
        lastError = aggregateError.message;
      }
      console.error(`[AI Analysis] All models failed:`, lastError);
    }

    if (!success) {
      res.status(502).json(errorResponse(`AI Analysis generation failed across all models. Last Error: ${lastError}`));
      return;
    }

    res.status(200).json(successResponse({ summary }, "AI Analysis generated"));
  }
);
