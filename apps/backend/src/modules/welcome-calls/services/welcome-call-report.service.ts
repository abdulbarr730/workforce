import ExcelJS from "exceljs";
import { WelcomeCallCampaign } from "../model/welcome-call-campaign.model";
import { WelcomeCallLead } from "../model/welcome-call-lead.model";

type ReportRange = { dateFrom?: string; dateTo?: string };

const rangeFilter = (range: ReportRange) => {
  const registeredAt: Record<string, Date> = {};
  if (range.dateFrom) {
    registeredAt.$gte = new Date(`${range.dateFrom}T00:00:00.000+05:30`);
  }
  if (range.dateTo) {
    registeredAt.$lte = new Date(`${range.dateTo}T23:59:59.999+05:30`);
  }
  return Object.keys(registeredAt).length ? { registeredAt } : {};
};

const percentage = (value: number, total: number) =>
  total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;

export async function buildWelcomeCallReport(
  campaignId: string,
  range: ReportRange = {},
) {
  const [campaign, leads] = await Promise.all([
    WelcomeCallCampaign.findById(campaignId).lean(),
    WelcomeCallLead.find({ campaignId, ...rangeFilter(range) })
      .sort({ registeredAt: -1 })
      .lean(),
  ]);
  if (!campaign) return null;

  const statusCounts = new Map<string, number>();
  const lastOutcomeCounts = new Map<string, number>();
  const agentRows = new Map<
    string,
    {
      employeeId: string;
      employeeName: string;
      currentlyAssigned: number;
      attempts: number;
      connected: number;
      notConnected: number;
      callback: number;
    }
  >();
  let attempts = 0;

  for (const lead of leads as any[]) {
    statusCounts.set(lead.status, (statusCounts.get(lead.status) || 0) + 1);
    if (lead.lastOutcome) {
      lastOutcomeCounts.set(
        lead.lastOutcome,
        (lastOutcomeCounts.get(lead.lastOutcome) || 0) + 1,
      );
    }
    if (lead.assignedToEmployeeId) {
      const current = agentRows.get(lead.assignedToEmployeeId) || {
        employeeId: lead.assignedToEmployeeId,
        employeeName: lead.assignedToEmployeeName || lead.assignedToEmployeeId,
        currentlyAssigned: 0,
        attempts: 0,
        connected: 0,
        notConnected: 0,
        callback: 0,
      };
      current.currentlyAssigned += 1;
      agentRows.set(lead.assignedToEmployeeId, current);
    }
    for (const attempt of lead.callAttempts || []) {
      attempts += 1;
      const current = agentRows.get(attempt.employeeId) || {
        employeeId: attempt.employeeId,
        employeeName: attempt.employeeName || attempt.employeeId,
        currentlyAssigned: 0,
        attempts: 0,
        connected: 0,
        notConnected: 0,
        callback: 0,
      };
      current.attempts += 1;
      if (attempt.outcome === "CONNECTED") current.connected += 1;
      if (attempt.outcome === "NOT_CONNECTED") current.notConnected += 1;
      if (attempt.outcome === "CALLBACK") current.callback += 1;
      agentRows.set(attempt.employeeId, current);
    }
  }

  const connected = statusCounts.get("CONNECTED") || 0;
  const totals = {
    registrations: leads.length,
    assigned: leads.filter((lead: any) => lead.assignedToEmployeeId).length,
    unassigned: statusCounts.get("UNASSIGNED") || 0,
    pending: statusCounts.get("PENDING") || 0,
    connected,
    notConnected: lastOutcomeCounts.get("NOT_CONNECTED") || 0,
    callback: statusCounts.get("CALLBACK") || 0,
    wrongNumber: statusCounts.get("WRONG_NUMBER") || 0,
    doNotCall: statusCounts.get("DO_NOT_CALL") || 0,
    attempts,
    connectionRate: percentage(connected, leads.length),
  };

  const byAgent = Array.from(agentRows.values())
    .map((agent) => ({
      ...agent,
      connectionRate: percentage(agent.connected, agent.attempts),
    }))
    .sort(
      (left, right) =>
        right.currentlyAssigned - left.currentlyAssigned ||
        left.employeeName.localeCompare(right.employeeName),
    );

  return {
    campaign,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    totals,
    byAgent,
    leads,
  };
}

const styleHeader = (worksheet: ExcelJS.Worksheet) => {
  const row = worksheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };
  row.alignment = { vertical: "middle" };
  row.height = 22;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  };
};

export async function buildWelcomeCallWorkbook(
  campaignId: string,
  range: ReportRange = {},
) {
  const report = await buildWelcomeCallReport(campaignId, range);
  if (!report) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Prosync Workforce OS";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 22 },
  ];
  [
    ["Campaign", report.campaign.name],
    [
      "Registration amount",
      `${report.campaign.currency} ${report.campaign.registrationAmount}`,
    ],
    ["From", range.dateFrom || "All time"],
    ["To", range.dateTo || "All time"],
    ["Registrations", report.totals.registrations],
    ["Assigned", report.totals.assigned],
    ["Unassigned", report.totals.unassigned],
    ["Pending", report.totals.pending],
    ["Connected", report.totals.connected],
    ["Not connected (latest outcome)", report.totals.notConnected],
    ["Call again", report.totals.callback],
    ["Wrong number", report.totals.wrongNumber],
    ["Do not call", report.totals.doNotCall],
    ["Total attempts", report.totals.attempts],
    ["Connection rate", `${report.totals.connectionRate}%`],
  ].forEach(([metric, value]) => summary.addRow({ metric, value }));
  styleHeader(summary);

  const agents = workbook.addWorksheet("Agent performance");
  agents.columns = [
    { header: "Employee ID", key: "employeeId", width: 16 },
    { header: "Agent", key: "employeeName", width: 26 },
    { header: "Currently assigned", key: "currentlyAssigned", width: 20 },
    { header: "Attempts", key: "attempts", width: 14 },
    { header: "Connected", key: "connected", width: 14 },
    { header: "Not connected", key: "notConnected", width: 16 },
    { header: "Call again", key: "callback", width: 14 },
    { header: "Connection %", key: "connectionRate", width: 16 },
  ];
  report.byAgent.forEach((agent) => agents.addRow(agent));
  styleHeader(agents);

  const calls = workbook.addWorksheet("Registrations and calls");
  calls.columns = [
    { header: "Registration ID", key: "externalRegistrationId", width: 24 },
    { header: "Name", key: "registrantName", width: 24 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 30 },
    { header: "Registered", key: "registeredAt", width: 22 },
    { header: "Current agent", key: "assignedToEmployeeName", width: 24 },
    { header: "Status", key: "status", width: 18 },
    { header: "Latest outcome", key: "lastOutcome", width: 18 },
    { header: "Attempts", key: "attemptCount", width: 12 },
    { header: "Redistributions", key: "redistributionCount", width: 16 },
    { header: "Next call", key: "nextCallAt", width: 22 },
  ];
  (report.leads as any[]).forEach((lead) =>
    calls.addRow({
      ...lead,
      registeredAt: new Date(lead.registeredAt).toLocaleString("en-IN"),
      nextCallAt: lead.nextCallAt
        ? new Date(lead.nextCallAt).toLocaleString("en-IN")
        : "",
    }),
  );
  styleHeader(calls);

  const attempts = workbook.addWorksheet("Call attempts");
  attempts.columns = [
    { header: "Registration ID", key: "externalRegistrationId", width: 24 },
    { header: "Registrant", key: "registrantName", width: 24 },
    { header: "Agent ID", key: "employeeId", width: 16 },
    { header: "Agent", key: "employeeName", width: 24 },
    { header: "Outcome", key: "outcome", width: 18 },
    { header: "Called at", key: "calledAt", width: 22 },
    { header: "Next call", key: "nextCallAt", width: 22 },
    { header: "Notes", key: "notes", width: 50 },
  ];
  (report.leads as any[]).forEach((lead) => {
    (lead.callAttempts || []).forEach((attempt: any) => {
      attempts.addRow({
        externalRegistrationId: lead.externalRegistrationId,
        registrantName: lead.registrantName,
        ...attempt,
        calledAt: new Date(attempt.calledAt).toLocaleString("en-IN"),
        nextCallAt: attempt.nextCallAt
          ? new Date(attempt.nextCallAt).toLocaleString("en-IN")
          : "",
      });
    });
  });
  styleHeader(attempts);

  return { workbook, report };
}
