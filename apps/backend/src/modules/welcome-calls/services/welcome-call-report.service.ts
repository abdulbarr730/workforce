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

const styleHeader = (
  worksheet: ExcelJS.Worksheet,
  fill = "FF1F2937",
  fontColor = "FFFFFFFF",
) => {
  const row = worksheet.getRow(1);
  row.font = { bold: true, color: { argb: fontColor } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: fill },
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
  workbook.calcProperties.fullCalcOnLoad = true;

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

  const agents = workbook.addWorksheet("Agent Summary");
  agents.columns = [
    { header: "Names", key: "employeeName", width: 28 },
    { header: "Total calls allotted", key: "allotted", width: 22 },
    { header: "Connected", key: "connected", width: 14 },
    { header: "Not connected", key: "notConnected", width: 16 },
    { header: "Left", key: "left", width: 14 },
  ];
  const assignedByAgent = new Map<
    string,
    {
      employeeName: string;
      allotted: number;
      connected: number;
      notConnected: number;
      left: number;
    }
  >();
  (report.leads as any[]).forEach((lead) => {
    if (!lead.assignedToEmployeeId) return;
    const row = assignedByAgent.get(lead.assignedToEmployeeId) || {
      employeeName: lead.assignedToEmployeeName || lead.assignedToEmployeeId,
      allotted: 0,
      connected: 0,
      notConnected: 0,
      left: 0,
    };
    row.allotted += 1;
    if (lead.status === "CONNECTED") row.connected += 1;
    else if (lead.status === "NOT_CONNECTED") row.notConnected += 1;
    else row.left += 1;
    assignedByAgent.set(lead.assignedToEmployeeId, row);
  });
  if (assignedByAgent.size === 0) {
    assignedByAgent.set("unassigned", {
      employeeName: "No assignments",
      allotted: 0,
      connected: 0,
      notConnected: 0,
      left: 0,
    });
  }
  Array.from(assignedByAgent.values())
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName))
    .forEach((agent) => agents.addRow(agent));
  const firstAgentRow = 2;
  const lastAgentRow = Math.max(firstAgentRow, agents.rowCount);
  const totalRow = agents.addRow({ employeeName: "Total" });
  totalRow.font = { bold: true };
  for (let column = 2; column <= 5; column += 1) {
    totalRow.getCell(column).value = {
      formula: `SUM(${agents.getColumn(column).letter}${firstAgentRow}:${agents.getColumn(column).letter}${lastAgentRow})`,
    };
  }
  const percentageRow = agents.addRow({ employeeName: "Percentage" });
  percentageRow.font = { bold: true };
  for (let column = 3; column <= 5; column += 1) {
    percentageRow.getCell(column).value = {
      formula: `IFERROR(${agents.getColumn(column).letter}${totalRow.number}/B${totalRow.number},0)`,
    };
    percentageRow.getCell(column).numFmt = "0.00%";
  }
  styleHeader(agents, "FFF4CCCC", "FF111827");
  agents.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF374151" } },
        left: { style: "thin", color: { argb: "FF374151" } },
        bottom: { style: "thin", color: { argb: "FF374151" } },
        right: { style: "thin", color: { argb: "FF374151" } },
      };
    });
  });
  agents.addConditionalFormatting({
    ref: `D2:D${lastAgentRow}`,
    rules: [
      {
        type: "cellIs",
        priority: 1,
        operator: "greaterThan",
        formulae: [4],
        style: {
          fill: {
            type: "pattern",
            pattern: "solid",
            bgColor: { argb: "FFFF0000" },
            fgColor: { argb: "FFFF0000" },
          },
        },
      },
    ],
  });

  const calls = workbook.addWorksheet("Call Register");
  calls.columns = [
    { header: "First Name", key: "firstName", width: 20 },
    { header: "Last Name", key: "lastName", width: 20 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone number", key: "phone", width: 18 },
    { header: "Allotted", key: "assignedToEmployeeName", width: 22 },
    { header: "Source", key: "source", width: 18 },
    { header: "Webinar Date", key: "webinarDate", width: 18 },
    { header: "Status", key: "status", width: 18 },
    { header: "Notes", key: "notes", width: 48 },
  ];
  (report.leads as any[]).forEach((lead) => {
    const nameParts = String(lead.registrantName || "")
      .trim()
      .split(/\s+/);
    const latestAttempt = lead.callAttempts?.at(-1);
    calls.addRow({
      firstName: nameParts.shift() || "",
      lastName: nameParts.join(" "),
      email: lead.email || "",
      phone: lead.phone,
      assignedToEmployeeName: lead.assignedToEmployeeName || "",
      source: String(lead.source || "").toUpperCase(),
      webinarDate: lead.webinarDate
        ? new Date(`${lead.webinarDate}T00:00:00.000+05:30`)
        : "",
      status: String(lead.lastOutcome || lead.status || "")
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      notes: latestAttempt?.notes || "",
    });
  });
  styleHeader(calls, "FFD9EAD3", "FF111827");
  calls.getColumn("phone").numFmt = "@";
  calls.getColumn("webinarDate").numFmt = "dd mmmm yyyy";
  for (let row = 2; row <= Math.max(2, calls.rowCount + 100); row += 1) {
    calls.getCell(`H${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [
        '"Connected,Not Connected,Call Again,Pending,Wrong Number,Do Not Call"',
      ],
    };
  }
  calls.addConditionalFormatting({
    ref: `H2:H${Math.max(2, calls.rowCount)}`,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: ['H2="Connected"'],
        style: {
          font: { color: { argb: "FFFFFFFF" } },
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF047857" },
          },
        },
      },
      {
        type: "expression",
        priority: 2,
        formulae: ['H2="Not Connected"'],
        style: {
          font: { color: { argb: "FFFFFFFF" } },
          fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFB91C1C" },
          },
        },
      },
    ],
  });

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
