import { env } from "../../../config/env";

type DiscordChannel = "break" | "auth" | "dailyFlow";

type DiscordNotificationInput = {
  title: string;
  message: string;
  employeeName?: string;
  employeeId?: string;
  eventType: string;
  reason?: string;
  channel: DiscordChannel;
  username?: string;
};

const colorForEvent = (eventType: string) => {
  if (eventType === "BREAK_START") return 0xf59e0b;
  if (eventType === "BREAK_EXCEEDED") return 0xef4444;
  if (eventType === "BREAK_END") return 0x10b981;
  if (eventType === "LOGIN") return 0x22c55e;
  if (eventType === "LOGOUT") return 0xef4444;
  if (eventType === "TODO") return 0x3b82f6;
  if (eventType === "EOD") return 0x8b5cf6;
  return 0x6366f1;
};

const webhookForChannel = (channel: DiscordChannel) => {
  if (channel === "auth") return env.DISCORD_AUTH_WEBHOOK_URL;
  if (channel === "dailyFlow") return env.DISCORD_DAILY_FLOW_WEBHOOK_URL;
  return env.DISCORD_BREAK_WEBHOOK_URL;
};

const webhookUsernameFor = (input: DiscordNotificationInput) => {
  // Discord limits webhook display names to 80 characters. Prefer the actual
  // employee name so each alert is immediately attributable in the channel.
  const employeeName = String(input.employeeName || "").trim();
  if (employeeName) return employeeName.slice(0, 80);
  return input.username || "Workforce Alerts";
};

// Discord webhooks allow only a few posts per couple of seconds. The morning
// rush (many logins at once) used to get 429s that were simply dropped, so
// posts go out one at a time per channel and are retried after Discord's
// retry_after.
const channelQueues = new Map<string, Promise<unknown>>();
const MAX_ATTEMPTS = 4;

export function dispatchDiscordNotification(
  input: DiscordNotificationInput,
): Promise<boolean | undefined> {
  const previous = channelQueues.get(input.channel) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => sendDiscordNotification(input));
  channelQueues.set(input.channel, next);
  return next;
}

/** true = delivered, false = failed after retries, undefined = no webhook. */
async function sendDiscordNotification(
  input: DiscordNotificationInput,
): Promise<boolean | undefined> {
  const webhookUrl = webhookForChannel(input.channel);
  if (!webhookUrl) return undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await postDiscordOnce(webhookUrl, input);
    if (result === "ok") return true;
    if (result === "fail" || attempt === MAX_ATTEMPTS) return false;
    await new Promise((resolve) => setTimeout(resolve, result));
  }
  return false;
}

/** "ok", "fail", or milliseconds to wait before retrying. */
async function postDiscordOnce(
  webhookUrl: string,
  input: DiscordNotificationInput,
): Promise<"ok" | "fail" | number> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: webhookUsernameFor(input),
        embeds: [
          {
            title: input.title,
            description: input.message,
            color: colorForEvent(input.eventType),
            fields: [
              {
                name: "Employee",
                value: [input.employeeName, input.employeeId && `(${input.employeeId})`]
                  .filter(Boolean)
                  .join(" ") || "Unknown",
                inline: true,
              },
              {
                name: "Event",
                value: input.eventType.replace(/_/g, " "),
                inline: true,
              },
              ...(input.reason
                ? [
                    {
                      name: "Reason",
                      value: input.reason,
                      inline: false,
                    },
                  ]
                : []),
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (response.ok) return "ok";
    if (response.status === 429 || response.status >= 500) {
      const body: any = await response.json().catch(() => ({}));
      const retryAfterSeconds = Number(
        body?.retry_after ?? response.headers.get("retry-after") ?? 2,
      );
      console.warn(
        `[Discord] ${input.channel} ${response.status}; retrying in ${retryAfterSeconds}s`,
      );
      return Math.min(30_000, Math.max(500, retryAfterSeconds * 1000));
    }
    console.error(
      `[Discord] ${input.channel} notification failed: ${response.status} ${response.statusText}`,
    );
    return "fail";
  } catch (error) {
    console.error(`[Discord] ${input.channel} notification dispatch failed:`, error);
    return 2_000;
  }
}

export async function dispatchDiscordBreakNotification(
  input: Omit<DiscordNotificationInput, "channel" | "username">,
) {
  return dispatchDiscordNotification({
    ...input,
    channel: "break",
    username: "Workforce Break Alerts",
  });
}

export async function dispatchDiscordAuthNotification(
  input: Omit<DiscordNotificationInput, "channel" | "username">,
) {
  return dispatchDiscordNotification({
    ...input,
    channel: "auth",
    username: "Workforce Login Alerts",
  });
}

export async function dispatchDiscordDailyFlowNotification(
  input: Omit<DiscordNotificationInput, "channel" | "username">,
) {
  return dispatchDiscordNotification({
    ...input,
    channel: "dailyFlow",
    username: "Workforce Todo EOD Alerts",
  });
}
