import { env } from "../../../config/env";
import { AiUsageLog } from "../model/ai-usage-log.model";

/**
 * Price per million tokens (USD), by model family. Estimates only: set
 * AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK to your real prices.
 */
const FAMILY_PRICES: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /haiku/i, input: 1, output: 5 },
  { match: /sonnet/i, input: 3, output: 15 },
  { match: /opus/i, input: 5, output: 25 },
];

export const pricesFor = (model: string | null | undefined) => {
  const envInput = Number(env.AI_PRICE_INPUT_PER_MTOK);
  const envOutput = Number(env.AI_PRICE_OUTPUT_PER_MTOK);
  if (envInput > 0 && envOutput > 0) return { input: envInput, output: envOutput };
  return FAMILY_PRICES.find((p) => p.match.test(model || "")) || { input: 3, output: 15 };
};

export const estimateCostUsd = (model: string | null | undefined, inputTokens: number, outputTokens: number) => {
  const price = pricesFor(model);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
};

/** Records one AI request. Never throws. */
export async function recordAiUsage(input: {
  feature?: string;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  status?: "OK" | "FAILED";
  error?: string | null;
}) {
  const inputTokens = Math.max(0, Number(input.inputTokens) || 0);
  const outputTokens = Math.max(0, Number(input.outputTokens) || 0);
  await AiUsageLog.create({
    feature: input.feature || "other",
    model: input.model || null,
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(input.model, inputTokens, outputTokens),
    status: input.status || "OK",
    error: input.error ? String(input.error).slice(0, 300) : null,
  }).catch(() => undefined);
}
