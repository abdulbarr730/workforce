import exceljs from "exceljs";
import { EmployeeAiAuditReport } from "./employee-ai-audit.service";

const HEADER_FILL = "1E293B";
const ACCENT_FILL = "4F46E5";
const LIGHT_FILL = "EEF2FF";

const formatDuration = (seconds: number) => {
  const totalMinutes = Math.round(Number(seconds || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
};

const autoFitColumns = (worksheet: exceljs.Worksheet) => {
  worksheet.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value == null ? "" : String(cell.value);
      maxLength = Math.max(maxLength, Math.min(value.length + 2, 55));
    });
    column.width = maxLength;
  });
};

const styleHeader = (row: exceljs.Row, fill = HEADER_FILL) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${fill}` },
  };
  row.alignment = { vertical: "middle" };
};

const addSection = (worksheet: exceljs.Worksheet, title: string) => {
  worksheet.addRow([]);
  const row = worksheet.addRow([title]);
  worksheet.mergeCells(row.number, 1, row.number, 7);
  styleHeader(row, ACCENT_FILL);
  row.height = 22;
};

const sanitizeSheetName = (
  name: string,
  employeeId: string,
  usedNames: Set<string>,
) => {
  const base =
    `${name} ${employeeId}`
      .replace(/[\\/?*:[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || "Employee";
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    const end = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - end.length)}${end}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
};

export const createEmployeeAiAuditWorkbook = async (
  report: EmployeeAiAuditReport,
) => {
  const workbook = new exceljs.Workbook();
  workbook.creator = "ProSync Workforce Platform";
  workbook.created = new Date(report.generatedAt);
  workbook.subject = "Per-employee Todo, EOD, application and AI audit";

  const summary = workbook.addWorksheet("Team Summary", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  summary.addRow(["Per-Employee AI Work Audit"]);
  summary.mergeCells("A1:T1");
  summary.getRow(1).font = {
    bold: true,
    size: 18,
    color: { argb: "FFFFFFFF" },
  };
  summary.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${ACCENT_FILL}` },
  };
  summary.getRow(1).height = 30;
  summary.addRow([
    "Date range",
    `${report.dateRange.startDate} to ${report.dateRange.endDate}`,
    "Generated",
    report.generatedAt,
    "AI model",
    report.ai.model,
  ]);
  summary.addRow([
    "Employees",
    report.summary.employeeCount,
    "Looks good",
    report.summary.looksGoodCount,
    "Needs review",
    report.summary.needsReviewCount,
    "Not analyzed / insufficient data",
    report.summary.notAnalyzedCount + report.summary.insufficientDataCount,
  ]);
  const summaryHeader = summary.addRow([
    "Employee",
    "Employee ID",
    "Department",
    "Todo Days",
    "EOD Days",
    "Todo Completion",
    "Todo/EOD Alignment",
    "Tracked Time",
    "Focus Score",
    "Coding Agents",
    "Google Sheets",
    "Counted Outputs",
    "Top EOD Task",
    "Repetitive Tasks",
    "Repetitive Task Time",
    "Automation Candidates",
    "AI Status",
    "AI Verdict",
    "Confidence",
    "AI Summary",
  ]);
  styleHeader(summaryHeader);

  report.employees.forEach((employee) => {
    summary.addRow([
      employee.name,
      employee.employeeId,
      employee.departmentName,
      `${employee.coverage.todoDays}/${employee.coverage.daysInRange}`,
      `${employee.coverage.eodDays}/${employee.coverage.daysInRange}`,
      `${employee.metrics.todoCompletionRate}%`,
      `${employee.metrics.todoEodAlignmentRate}%`,
      formatDuration(employee.metrics.trackedSeconds),
      `${employee.metrics.focusScore}%`,
      formatDuration(employee.metrics.codingAgentSeconds),
      formatDuration(employee.metrics.googleSheetsSeconds),
      employee.metrics.eodActivityCount,
      employee.taskWorkSummary[0]?.task || "No EOD task recorded",
      employee.metrics.repetitiveTaskCount,
      formatDuration(employee.metrics.repetitiveTaskMinutes * 60),
      employee.ai.automationOpportunities.length ||
        employee.metrics.automationCandidateCount,
      employee.ai.status,
      employee.ai.verdict,
      employee.ai.confidence,
      employee.ai.summary,
    ]);
  });
  summary.autoFilter = {
    from: { row: summaryHeader.number, column: 1 },
    to: { row: summaryHeader.number, column: 20 },
  };
  summary.eachRow((row, rowNumber) => {
    if (rowNumber > summaryHeader.number) {
      const verdict = String(row.getCell(18).value || "");
      row.getCell(18).font = {
        bold: true,
        color: {
          argb:
            verdict === "LOOKS_GOOD"
              ? "FF047857"
              : verdict === "NEEDS_REVIEW"
                ? "FFB45309"
                : "FF64748B",
        },
      };
    }
  });
  autoFitColumns(summary);

  const usedNames = new Set(["team summary"]);
  report.employees.forEach((employee) => {
    const worksheet = workbook.addWorksheet(
      sanitizeSheetName(employee.name, employee.employeeId, usedNames),
      { views: [{ state: "frozen", ySplit: 1 }] },
    );
    worksheet.columns = Array.from({ length: 7 }, (_, index) => ({
      key: `column${index + 1}`,
      width: 18,
    }));

    const title = worksheet.addRow([
      `${employee.name} (${employee.employeeId}) — Individual Work Audit`,
    ]);
    worksheet.mergeCells(title.number, 1, title.number, 7);
    styleHeader(title, ACCENT_FILL);
    title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    title.height = 28;

    addSection(worksheet, "Evidence Overview");
    const metricHeader = worksheet.addRow([
      "Department",
      "Tracked Time",
      "Productive",
      "Unproductive",
      "Focus Score",
      "Coding Agents",
      "Google Sheets",
    ]);
    styleHeader(metricHeader);
    worksheet.addRow([
      employee.departmentName,
      formatDuration(employee.metrics.trackedSeconds),
      formatDuration(employee.metrics.productiveSeconds),
      formatDuration(employee.metrics.unproductiveSeconds),
      `${employee.metrics.focusScore}%`,
      formatDuration(employee.metrics.codingAgentSeconds),
      formatDuration(employee.metrics.googleSheetsSeconds),
    ]);
    worksheet.addRow([
      "Todo completion",
      `${employee.metrics.completedTodoItems}/${employee.metrics.plannedTodoItems} (${employee.metrics.todoCompletionRate}%)`,
      "Todo/EOD alignment",
      `${employee.metrics.todoEodAlignedItems}/${employee.metrics.plannedTodoItems} (${employee.metrics.todoEodAlignmentRate}%)`,
      "EOD tasks",
      employee.metrics.eodTaskCount,
      `Counted outputs: ${employee.metrics.eodActivityCount}; Calls: ${employee.metrics.eodCallCount}`,
    ]);
    worksheet.addRow([
      "Coverage",
      `${employee.coverage.attendanceDays} attendance day(s)`,
      `${employee.coverage.todoDays} Todo day(s)`,
      `${employee.coverage.eodDays} EOD day(s)`,
      "Tool detail",
      employee.coverage.toolTrackingDetail,
    ]);
    worksheet.addRow([
      "Assigned department",
      employee.employmentContext.assignedDepartment,
      "Department responsibilities",
      employee.employmentContext.departmentDescription || "Not recorded",
      "Job title",
      employee.employmentContext.jobTitle || "Not recorded",
      `System role: ${employee.employmentContext.platformRole}`,
    ]);

    addSection(worksheet, "Todo, EOD & Workload Summaries");
    worksheet.addRow(["Todo summary", employee.summaries.todo]);
    worksheet.addRow(["EOD summary", employee.summaries.eod]);
    worksheet.addRow(["Workload summary", employee.summaries.workload]);
    worksheet.addRow(["Repetition summary", employee.summaries.repetition]);

    addSection(worksheet, "Monthly / Period Breakdown");
    const periodHeader = worksheet.addRow([
      "Period",
      "Todo Days",
      "Todo Completed",
      "EOD Days",
      "EOD Tasks / Time",
      "Counted Outputs",
      "Tracked Time",
    ]);
    styleHeader(periodHeader);
    if (employee.periodBreakdown.length === 0) {
      worksheet.addRow(["No activity recorded"]);
    } else {
      employee.periodBreakdown.forEach((period) =>
        worksheet.addRow([
          period.period,
          period.todoDays,
          `${period.completedTodoItems}/${period.plannedTodoItems}`,
          period.eodDays,
          `${period.eodTasks} / ${formatDuration(period.eodMinutes * 60)}`,
          period.activityCount,
          formatDuration(period.trackedSeconds),
        ]),
      );
    }

    addSection(worksheet, "Task Workload & Repetition");
    const taskSummaryHeader = worksheet.addRow([
      "Task Group",
      "EOD Occurrences",
      "Todo Occurrences",
      "Days Worked",
      "Total EOD Time",
      "Average per EOD Entry",
      "Counted Outputs",
      "Automation Signal",
    ]);
    styleHeader(taskSummaryHeader);
    if (employee.taskWorkSummary.length === 0) {
      worksheet.addRow(["No Todo or EOD tasks recorded"]);
    } else {
      employee.taskWorkSummary.forEach((task) =>
        worksheet.addRow([
          task.task,
          task.eodOccurrences,
          task.todoOccurrences,
          task.daysWorked,
          formatDuration(task.totalMinutes * 60),
          formatDuration(task.averageMinutes * 60),
          task.activityCount,
          task.automationSignal.replaceAll("_", " "),
        ]),
      );
    }

    addSection(worksheet, "AI Assessment");
    const aiHeader = worksheet.addRow([
      "Status",
      "Verdict",
      "Confidence",
      "Summary",
      "Time-use assessment",
      "Todo/EOD assessment",
      "Model",
    ]);
    styleHeader(aiHeader);
    worksheet.addRow([
      employee.ai.status,
      employee.ai.verdict,
      employee.ai.confidence,
      employee.ai.summary,
      employee.ai.timeUseAssessment,
      employee.ai.todoEodAssessment,
      employee.ai.model || "Not used",
    ]);
    worksheet.addRow([
      "Strengths",
      employee.ai.strengths.join(" • ") || "None identified",
      "Concerns",
      employee.ai.concerns.join(" • ") || "None identified",
      "Follow-ups",
      employee.ai.recommendations.join(" • ") || "None identified",
    ]);

    worksheet.addRow([
      "Department alignment",
      employee.ai.departmentAlignmentAssessment || "Not analyzed",
    ]);
    worksheet.addRow([
      "Application assessment",
      employee.ai.applicationAssessment || "Not analyzed",
    ]);

    addSection(worksheet, "AI Work Category Analysis");
    const categoryHeader = worksheet.addRow([
      "Work Category",
      "Todo / EOD / Application Evidence",
      "Recorded Task Time",
      "Tracked Application Time",
      "Assessment",
    ]);
    styleHeader(categoryHeader);
    if (employee.ai.workCategoryAnalysis.length === 0) {
      worksheet.addRow(["No AI category analysis available"]);
    } else {
      employee.ai.workCategoryAnalysis.forEach((category) =>
        worksheet.addRow([
          category.category,
          category.evidence.join(" • "),
          category.recordedTaskTime,
          category.trackedApplicationTime,
          category.assessment,
        ]),
      );
    }

    addSection(worksheet, "AI Automation Opportunities");
    const automationHeader = worksheet.addRow([
      "Task",
      "Why It Is a Candidate",
      "Recorded Time in Range",
      "Suggested Automation",
      "Confidence",
    ]);
    styleHeader(automationHeader);
    if (employee.ai.automationOpportunities.length === 0) {
      worksheet.addRow([
        "No AI-confirmed automation opportunity",
        "Repetition alone does not prove that a task should be automated.",
      ]);
    } else {
      employee.ai.automationOpportunities.forEach((opportunity) =>
        worksheet.addRow([
          opportunity.task,
          opportunity.reason,
          opportunity.estimatedTimeInRange,
          opportunity.automationApproach,
          opportunity.confidence,
        ]),
      );
    }

    addSection(worksheet, "Coding Agents, Google Sheets & Development Tools");
    const toolHeader = worksheet.addRow([
      "Category",
      "Tool",
      "Duration",
      "Seconds",
      "Activity Segments",
    ]);
    styleHeader(toolHeader);
    const tools = [
      ...employee.tools.codingAgents.map((tool) => ({
        ...tool,
        category: "Coding Agent",
      })),
      ...employee.tools.googleSheets.map((tool) => ({
        ...tool,
        category: "Google Sheets",
      })),
      ...employee.tools.developmentTools.map((tool) => ({
        ...tool,
        category: "Development Tool",
      })),
    ];
    if (tools.length === 0) {
      worksheet.addRow(["No detailed tool usage found", "", "0m", 0, 0]);
    } else {
      tools.forEach((tool) =>
        worksheet.addRow([
          tool.category,
          tool.tool,
          formatDuration(tool.seconds),
          tool.seconds,
          tool.activitySegments,
        ]),
      );
    }

    addSection(worksheet, "All Recorded Application Usage");
    const appHeader = worksheet.addRow([
      "Application / Domain",
      "Duration",
      "Seconds",
      "Activity Segments",
      "Productivity Category",
    ]);
    styleHeader(appHeader);
    employee.appUsage.forEach((app) =>
      worksheet.addRow([
        app.app,
        formatDuration(app.seconds),
        app.seconds,
        app.activitySegments,
        app.productivityCategory,
      ]),
    );

    addSection(worksheet, "Todo Plan");
    const todoHeader = worksheet.addRow([
      "Date",
      "Task",
      "Completed",
      "Estimated Time",
      "Recorded Time",
    ]);
    styleHeader(todoHeader);
    employee.todos.forEach((todo) =>
      todo.items.forEach((item) =>
        worksheet.addRow([
          todo.date,
          item.text,
          item.done ? "Yes" : "No",
          item.estimatedTime,
          item.timeTaken,
        ]),
      ),
    );

    addSection(worksheet, "EOD Work Report");
    const eodHeader = worksheet.addRow([
      "Date",
      "Timestamp",
      "Task",
      "Duration",
      "Count",
      "Top Task",
      "Blockers",
    ]);
    styleHeader(eodHeader);
    employee.eods.forEach((eod) =>
      eod.tasks.forEach((task) =>
        worksheet.addRow([
          eod.date,
          task.interval,
          task.text,
          task.timeTaken,
          task.count || task.callCount || "",
          task.isTopTask ? "Yes" : "No",
          eod.blockers,
        ]),
      ),
    );

    worksheet.eachRow((row) => {
      row.alignment = { ...row.alignment, vertical: "top", wrapText: true };
    });
    worksheet.getColumn(2).width = 34;
    worksheet.getColumn(3).width = 42;
    worksheet.getColumn(4).width = 34;
    worksheet.getColumn(5).width = 30;
    worksheet.getColumn(6).width = 36;
    worksheet.getColumn(7).width = 28;
    worksheet.getRow(1).alignment = { vertical: "middle" };
  });

  // Give blank cells a subtle readable background only in the team header area.
  summary.getRow(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${LIGHT_FILL}` },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
