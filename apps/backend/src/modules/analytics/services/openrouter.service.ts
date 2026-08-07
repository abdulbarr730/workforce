import { env } from "../../../config/env";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CompletionOptions = {
  messages: OpenRouterMessage[];
  maxCompletionTokens?: number;
  temperature?: number;
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
  };
};

type OpenRouterResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; code?: string | number };
};

const OPENROUTER_TIMEOUT_MS = 90_000;
const STRUCTURED_FREE_MODEL_FALLBACKS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-20b:free",
];

export class OpenRouterRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = "OpenRouterRequestError";
  }
}

export const getOpenRouterStatus = () => ({
  configured: Boolean(env.OPENROUTER_API_KEY),
  model: env.OPENROUTER_MODEL,
});

export const requestOpenRouterCompletion = async ({
  messages,
  maxCompletionTokens = 1_200,
  temperature = 0.15,
  jsonSchema,
}: CompletionOptions) => {
  if (!env.OPENROUTER_API_KEY) {
    throw new OpenRouterRequestError(
      "OpenRouter is not configured. Add OPENROUTER_API_KEY to the backend environment.",
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  const modelCandidates = env.OPENROUTER_MODEL.endsWith(":free")
    ? Array.from(
        new Set([env.OPENROUTER_MODEL, ...STRUCTURED_FREE_MODEL_FALLBACKS]),
      )
    : [env.OPENROUTER_MODEL];

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.OPENROUTER_SITE_URL,
          "X-OpenRouter-Title": env.OPENROUTER_APP_NAME,
        },
        body: JSON.stringify({
          ...(modelCandidates.length > 1
            ? { models: modelCandidates }
            : { model: modelCandidates[0] }),
          messages,
          max_tokens: maxCompletionTokens,
          temperature,
          reasoning: { effort: "low", exclude: true },
          provider: { sort: "throughput", require_parameters: true },
          ...(jsonSchema
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: jsonSchema.name,
                    strict: true,
                    schema: jsonSchema.schema,
                  },
                },
              }
            : {}),
        }),
        signal: controller.signal,
      },
    );

    const rawBody = await response.text();
    let data: OpenRouterResponse = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      // The status-aware error below is more useful than a JSON parse exception.
    }

    if (!response.ok) {
      const upstreamMessage = data.error?.message || response.statusText;
      const publicMessage =
        response.status === 401
          ? "OpenRouter rejected the API key. Check OPENROUTER_API_KEY."
          : response.status === 402
            ? "OpenRouter credits are insufficient for the configured model."
            : response.status === 429
              ? "OpenRouter rate limit reached. Please retry shortly."
              : `OpenRouter request failed (${response.status}): ${upstreamMessage}`;
      throw new OpenRouterRequestError(publicMessage, response.status);
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new OpenRouterRequestError(
        "OpenRouter returned an empty analysis.",
        502,
      );
    }

    return {
      content,
      model: data.model || env.OPENROUTER_MODEL,
    };
  } catch (error) {
    if (error instanceof OpenRouterRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenRouterRequestError(
        `OpenRouter timed out after ${OPENROUTER_TIMEOUT_MS / 1_000} seconds.`,
        504,
      );
    }
    throw new OpenRouterRequestError(
      error instanceof Error
        ? `OpenRouter connection failed: ${error.message}`
        : "OpenRouter connection failed.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const extractJsonObject = (content: string): unknown => {
  const withoutFence = content
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    // Some routed models still wrap structured output in prose or LaTeX.
    // Walk every balanced object candidate and return the first valid JSON.
    for (let start = 0; start < withoutFence.length; start += 1) {
      if (withoutFence[start] !== "{") continue;
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let end = start; end < withoutFence.length; end += 1) {
        const character = withoutFence[end];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (character === "\\") {
            escaped = true;
          } else if (character === '"') {
            inString = false;
          }
          continue;
        }

        if (character === '"') inString = true;
        else if (character === "{") depth += 1;
        else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            try {
              return JSON.parse(withoutFence.slice(start, end + 1));
            } catch {
              break;
            }
          }
        }
      }
    }
    throw new OpenRouterRequestError(
      "OpenRouter returned analysis in an unexpected format.",
      502,
    );
  }
};
