import { env } from "../../../config/env";

type TeamsBreakNotificationInput = {
  title: string;
  message: string;
  employeeName: string;
  eventType: string;
  reason?: string;
};

export async function dispatchTeamsBreakNotification(
  input: TeamsBreakNotificationInput,
) {
  const webhookUrl = env.TEAMS_BREAK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const reasonText = input.reason ? `\nReason: ${input.reason}` : "";
  const text = [
    `**${input.title}**`,
    input.message,
    `Employee: ${input.employeeName}`,
    `Event: ${input.eventType.replace(/_/g, " ")}`,
    reasonText.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      console.error(
        `[Teams] Break notification failed: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("[Teams] Break notification dispatch failed:", error);
  }
}
