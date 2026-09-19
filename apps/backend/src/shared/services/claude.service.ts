import { env } from "../../config/env";
import crypto from "crypto";
import fs from "fs";

type ClaudeMessage = {
  role: "user" | "assistant";
  content: string;
};

type ClaudeOptions = {
  system?: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  temperature?: number;
  bypassCache?: boolean;
};

type ClaudeResponse = {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string; type?: string };
};

const CLAUDE_TIMEOUT_MS = 90_000;

// 5-minute in-memory response cache to save tokens on repeated prompts
const responseCache = new Map<
  string,
  { content: string; model: string; expiresAt: number }
>();

const getCacheKey = (system: string | undefined, messages: ClaudeMessage[]) => {
  const raw = `${system || ""}|${JSON.stringify(messages)}`;
  return crypto.createHash("md5").update(raw).digest("hex");
};

export class ClaudeRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = "ClaudeRequestError";
  }
}

/**
 * Resolves authentication headers dynamically.
 * Supports:
 * 1. Workload Identity Federation (WIF) OIDC Token File (mounted by Cloud/K8s/CI)
 * 2. Dynamic OIDC / IAM Bearer Token (IDENTITY_FEDERATION_TOKEN)
 * 3. Static Anthropic API Key (ANTHROPIC_API_KEY)
 */
const getAiAuthHeaders = async (): Promise<{
  headers: Record<string, string>;
  authMethod: "WIF_TOKEN_FILE" | "WIF_BEARER_TOKEN" | "API_KEY";
}> => {
  // Option 1: Workload Identity Federation OIDC Token File (Auto-rotating mounted token)
  if (
    env.IDENTITY_FEDERATION_TOKEN_FILE &&
    fs.existsSync(env.IDENTITY_FEDERATION_TOKEN_FILE)
  ) {
    try {
      const token = fs
        .readFileSync(env.IDENTITY_FEDERATION_TOKEN_FILE, "utf-8")
        .trim();
      if (token) {
        return {
          headers: {
            Authorization: `Bearer ${token}`,
            "anthropic-version": "2023-06-01",
          },
          authMethod: "WIF_TOKEN_FILE",
        };
      }
    } catch (err) {
      console.error("Failed to read IDENTITY_FEDERATION_TOKEN_FILE", err);
    }
  }

  // Option 2: Workload Identity Federation Bearer Token
  if (env.IDENTITY_FEDERATION_TOKEN) {
    return {
      headers: {
        Authorization: `Bearer ${env.IDENTITY_FEDERATION_TOKEN.trim()}`,
        "anthropic-version": "2023-06-01",
      },
      authMethod: "WIF_BEARER_TOKEN",
    };
  }

  // Option 3: Fallback to Static API Key
  if (env.ANTHROPIC_API_KEY) {
    return {
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      authMethod: "API_KEY",
    };
  }

  throw new ClaudeRequestError(
    "AI Authentication not configured. Provide ANTHROPIC_API_KEY or set up Workload Identity Federation (IDENTITY_FEDERATION_TOKEN_FILE / IDENTITY_FEDERATION_TOKEN).",
    503
  );
};

export const getClaudeStatus = () => {
  const hasWifFile =
    Boolean(env.IDENTITY_FEDERATION_TOKEN_FILE) &&
    fs.existsSync(env.IDENTITY_FEDERATION_TOKEN_FILE);
  const hasWifToken = Boolean(env.IDENTITY_FEDERATION_TOKEN);
  const hasApiKey = Boolean(env.ANTHROPIC_API_KEY);

  const isConfigured = hasWifFile || hasWifToken || hasApiKey;
  const authMode = hasWifFile
    ? "IDENTITY_FEDERATION_WIF_FILE"
    : hasWifToken
    ? "IDENTITY_FEDERATION_BEARER_TOKEN"
    : hasApiKey
    ? "STATIC_API_KEY"
    : "UNCONFIGURED";

  return {
    configured: isConfigured,
    model: env.CLAUDE_MODEL,
    authMode,
    identityFederationEnabled: hasWifFile || hasWifToken,
  };
};

export const requestClaudeJson = async ({
  system,
  messages,
  maxTokens = 1_000,
  temperature = 0.1,
  bypassCache = false,
}: ClaudeOptions) => {
  const authInfo = await getAiAuthHeaders();

  const cacheKey = getCacheKey(system, messages);
  const now = Date.now();

  // Check cache unless explicitly bypassed
  if (!bypassCache && responseCache.has(cacheKey)) {
    const cached = responseCache.get(cacheKey)!;
    if (cached.expiresAt > now) {
      return {
        content: cached.content,
        model: `${cached.model} (cached - 0 tokens)`,
        authMode: authInfo.authMethod,
      };
    } else {
      responseCache.delete(cacheKey);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authInfo.headers,
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
          ? `Claude rejected credentials (${authInfo.authMethod}).`
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

    const modelName = data.model || env.CLAUDE_MODEL;

    // Cache response for 5 minutes (300,000 ms)
    responseCache.set(cacheKey, {
      content: text,
      model: modelName,
      expiresAt: now + 5 * 60 * 1000,
    });

    return {
      content: text,
      model: modelName,
      authMode: authInfo.authMethod,
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
