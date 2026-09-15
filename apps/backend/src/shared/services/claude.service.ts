import { env } from "../../config/env";

type ClaudeMessage = {
  role: "user" | "assistant";
  content: string;
};

type ClaudeOptions = {
  system?: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  temperature?: number;
};

type ClaudeResponse = {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string; type?: string };
};

const CLAUDE_TIMEOUT_MS = 90_000;

export class ClaudeRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = "ClaudeRequestError";
  }
}

export const getClaudeStatus = () => ({
  configured: Boolean(env.ANTHROPIC_API_KEY),
  model: env.CLAUDE_MODEL,
});

export const requestClaudeJson = async ({
  system,
  messages,
  maxTokens = 2_000,
  temperature = 0.1,
}: ClaudeOptions) => {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ClaudeRequestError(
      "Claude is not configured. Add ANTHROPIC_API_KEY to the backend environment.",
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature,
        ...(system ? { system } : {}),
        messages,
      }),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let data: ClaudeResponse = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      // handled by response checks below
    }

    if (!response.ok) {
      const upstream = data.error?.message || response.statusText;
      const message =
        response.status === 401
          ? "Claude rejected ANTHROPIC_API_KEY."
          : response.status === 429
            ? "Claude rate limit reached. Please retry shortly."
            : `Claude request failed (${response.status}): ${upstream}`;
      throw new ClaudeRequestError(message, response.status);
    }

    const text = (data.content || [])
      .map((part) => (part.type === "text" ? part.text || "" : ""))
      .join("")
      .trim();

    if (!text) {
      throw new ClaudeRequestError("Claude returned an empty response.", 502);
    }

    return {
      content: text,
      model: data.model || env.CLAUDE_MODEL,
    };
  } catch (error) {
    if (error instanceof ClaudeRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ClaudeRequestError(
        `Claude timed out after ${CLAUDE_TIMEOUT_MS / 1_000} seconds.`,
        504,
      );
    }
    throw new ClaudeRequestError(
      error instanceof Error
        ? `Claude connection failed: ${error.message}`
        : "Claude connection failed.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const extractClaudeJsonObject = (content: string): unknown => {
  const withoutFence = content
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    for (let start = 0; start < withoutFence.length; start += 1) {
      if (withoutFence[start] !== "{") continue;
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let end = start; end < withoutFence.length; end += 1) {
        const char = withoutFence[end];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') inString = true;
        else if (char === "{") depth += 1;
        else if (char === "}") {
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
    throw new ClaudeRequestError("Claude returned non-JSON output.", 502);
  }
};
