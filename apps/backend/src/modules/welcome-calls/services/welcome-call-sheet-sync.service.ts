import { env } from "../../../config/env";
import { logger } from "../../../shared/logger/logger";
import { notificationService } from "../../../shared/services/notification.service";
import { WelcomeCallCampaign } from "../model/welcome-call-campaign.model";
import { WelcomeCallLead } from "../model/welcome-call-lead.model";

const statusLabels: Record<string, string> = {
  UNASSIGNED: "Unassigned",
  PENDING: "Pending",
  CONNECTED: "Connected",
  NOT_CONNECTED: "Not Connected",
  CALLBACK: "Call Again",
  WRONG_NUMBER: "Wrong Number",
  DO_NOT_CALL: "Do Not Call",
};

export async function syncWelcomeCallLeadToSheet(
  lead: any,
  options: { clearOutcome?: boolean } = {},
) {
  if (!env.WELCOME_CALL_SHEET_WEBHOOK_URL) return;
  const latestAttempt = Array.isArray(lead.callAttempts)
    ? lead.callAttempts.at(-1)
    : undefined;
  const names = String(lead.registrantName || "")
    .trim()
    .split(/\s+/);
  const sheetCampaign: any = await WelcomeCallCampaign.findById(lead.campaignId)
    .select("customColumns")
    .lean();
  const response = await fetch(env.WELCOME_CALL_SHEET_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret: env.WELCOME_CALL_SHEET_WEBHOOK_SECRET,
      sheetName: env.WELCOME_CALL_SHEET_NAME,
      registrationId: lead.externalRegistrationId,
      firstName: names.shift() || "",
      lastName: names.join(" "),
      email: lead.email || "",
      phone: lead.phone || "",
      allotted: lead.assignedToEmployeeName || "",
      assignedAt: lead.assignedAt || null,
      source: String(lead.source || "").toUpperCase(),
      webinarDate: lead.webinarDate || "",
      status: statusLabels[lead.status] || lead.status,
      notes: latestAttempt?.notes || "",
      calledAt: latestAttempt?.calledAt || null,
      updatedAt: new Date().toISOString(),
      clearOutcome: options.clearOutcome === true,
      customColumns: (sheetCampaign?.customColumns || []).map(
        (column: any) => ({
          key: column.key,
          label: column.label,
          options: column.options || [],
          value: lead.metadata?.customFields?.[column.key] || "",
        }),
      ),
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Google Sheet sync returned HTTP ${response.status}`);
  }
  const result = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    found?: boolean;
    message?: string;
  };
  if (result.success === false) {
    throw new Error(result.message || "Google Sheet rejected the update");
  }
  const leadId = String(lead._id || "");
  if (result.found === false) {
    await WelcomeCallLead.updateOne(
      { _id: leadId },
      { $set: { "metadata.sheetSyncMissing": true } },
    );
    const campaign = await WelcomeCallCampaign.findById(lead.campaignId)
      .select("name responsiblePeople")
      .lean();
    const payload = {
      title: "Welcome-call row missing from Google Sheet",
      message: `${lead.registrantName} (${lead.phone}) was not found in the ${env.WELCOME_CALL_SHEET_NAME} sheet. The result was saved in Workforce but not added as a new sheet row.`,
      campaignId: String(lead.campaignId || ""),
      leadId,
      deepLink: "/dashboard/welcome-calls",
    };
    for (const person of campaign?.responsiblePeople || []) {
      notificationService.broadcastToUser(
        person.employeeId,
        "welcome_call_sheet_missing",
        payload,
      );
    }
    notificationService.broadcastToRoles(
      ["ADMIN", "SUPER_ADMIN"],
      "welcome_call_sheet_missing",
      payload,
    );
    return;
  }
  await WelcomeCallLead.updateOne(
    { _id: leadId },
    { $unset: { "metadata.sheetSyncMissing": "" } },
  );
}

export function queueWelcomeCallSheetSync(
  lead: any,
  options: { clearOutcome?: boolean } = {},
) {
  void syncWelcomeCallLeadToSheet(lead, options).catch((error) =>
    logger.warn(
      { err: error, leadId: String(lead?._id || "") },
      "Welcome-call Google Sheet sync failed",
    ),
  );
}
