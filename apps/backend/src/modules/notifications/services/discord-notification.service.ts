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

export async function dispatchDiscordNotification(
  input: DiscordNotificationInput,
) {
  const webhookUrl = webhookForChannel(input.channel);
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: input.username || "Workforce Alerts",
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
    if (!response.ok) {
      console.error(
        `[Discord] ${input.channel} notification failed: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error(`[Discord] ${input.channel} notification dispatch failed:`, error);
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
