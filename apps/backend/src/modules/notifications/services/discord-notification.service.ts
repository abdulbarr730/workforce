import { env } from "../../../config/env";

type DiscordBreakNotificationInput = {
  title: string;
  message: string;
  employeeName: string;
  eventType: string;
  reason?: string;
};

const colorForEvent = (eventType: string) => {
  if (eventType === "BREAK_START") return 0xf59e0b;
  if (eventType === "BREAK_EXCEEDED") return 0xef4444;
  if (eventType === "BREAK_END") return 0x10b981;
  return 0x6366f1;
};

export async function dispatchDiscordBreakNotification(
  input: DiscordBreakNotificationInput,
) {
  const webhookUrl = env.DISCORD_BREAK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Workforce Break Alerts",
        embeds: [
          {
            title: input.title,
            description: input.message,
            color: colorForEvent(input.eventType),
            fields: [
              {
                name: "Employee",
                value: input.employeeName || "Unknown",
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
        `[Discord] Break notification failed: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("[Discord] Break notification dispatch failed:", error);
  }
}
