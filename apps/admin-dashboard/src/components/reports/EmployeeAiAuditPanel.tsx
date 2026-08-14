"use client";

import { useState } from "react";
import {
  AlertTriangle,
  AppWindow,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Clock3,
  Code2,
  Download,
  FileArchive,
  FileSpreadsheet,
  Loader2,
  SearchCheck,
  Sheet,
  Sparkles,
  Repeat2,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";

type EmployeeOption = {
  employeeId: string;
  name: string;
  role?: string;
};

type ToolUsage = {
  tool: string;
  seconds: number;
  activitySegments: number;
};

type EmployeeAudit = {
  employeeId: string;
  name: string;
  departmentName: string;
  employmentContext: {
    assignedDepartment: string;
    departmentDescription: string;
    platformRole: string;
    jobTitle: string | null;
    contextCoverage:
      | "DEPARTMENT_DESCRIPTION"
      | "DEPARTMENT_NAME_ONLY"
      | "UNASSIGNED";
  };
  coverage: {
    daysInRange: number;
    attendanceDays: number;
    todoDays: number;
    eodDays: number;
    toolTrackingDetail: "FULL" | "DAILY_SUMMARY_ONLY" | "NONE";
  };
  metrics: {
    plannedTodoItems: number;
    completedTodoItems: number;
    todoCompletionRate: number;
    eodTaskCount: number;
    eodActivityCount: number;
    eodCallCount: number;
    todoEodAlignmentRate: number;
    trackedSeconds: number;
    productiveSeconds: number;
    unproductiveSeconds: number;
    focusScore: number;
    codingAgentSeconds: number;
    googleSheetsSeconds: number;
    developmentToolSeconds: number;
    repetitiveTaskCount: number;
    repetitiveTaskMinutes: number;
    automationCandidateCount: number;
    automationCandidateMinutes: number;
  };
  tools: {
    codingAgents: ToolUsage[];
    googleSheets: ToolUsage[];
    developmentTools: ToolUsage[];
  };
  appUsage: Array<{
    app: string;
    seconds: number;
    activitySegments: number;
    productivityCategory: string;
  }>;
  taskWorkSummary: Array<{
    task: string;
    examples: string[];
    todoOccurrences: number;
    completedTodoOccurrences: number;
    eodOccurrences: number;
    daysWorked: number;
    totalMinutes: number;
    averageMinutes: number;
    activityCount: number;
    callCount: number;
    isRepetitive: boolean;
    automationSignal: "STRONG_PATTERN" | "RECURRING_REVIEW" | "NONE";
  }>;
  summaries: {
    todo: string;
    eod: string;
    workload: string;
    repetition: string;
  };
  periodBreakdown: Array<{
    period: string;
    todoDays: number;
    plannedTodoItems: number;
    completedTodoItems: number;
    eodDays: number;
    eodTasks: number;
    eodMinutes: number;
    activityCount: number;
    callCount: number;
    trackedSeconds: number;
  }>;
  ai: {
    status: "completed" | "unavailable" | "failed" | "skipped";
    verdict:
      | "LOOKS_GOOD"
      | "NEEDS_REVIEW"
      | "INSUFFICIENT_DATA"
      | "NOT_ANALYZED";
    confidence: "LOW" | "MEDIUM" | "HIGH";
    summary: string;
    timeUseAssessment: string;
    applicationAssessment: string;
    todoEodAssessment: string;
    departmentAlignmentAssessment: string;
    workCategoryAnalysis: Array<{
      category: string;
      evidence: string[];
      recordedTaskTime: string;
      trackedApplicationTime: string;
      assessment: string;
    }>;
    automationOpportunities: Array<{
      task: string;
      reason: string;
      estimatedTimeInRange: string;
      automationApproach: string;
      confidence: "LOW" | "MEDIUM" | "HIGH";
    }>;
    strengths: string[];
    concerns: string[];
    recommendations: string[];
    error?: string;
  };
};

type AuditReport = {
  schemaVersion: 1;
  generatedAt: string;
  dateRange: { startDate: string; endDate: string };
  ai: {
    configured: boolean;
    requested: boolean;
    model: string;
    completedEmployees: number;
    failedEmployees: number;
    note?: string;
  };
  summary: {
    employeeCount: number;
    looksGoodCount: number;
    needsReviewCount: number;
    insufficientDataCount: number;
    notAnalyzedCount: number;
    totalTrackedSeconds: number;
    codingAgentSeconds: number;
    googleSheetsSeconds: number;
    repetitiveTaskCount: number;
    repetitiveTaskMinutes: number;
    automationCandidateCount: number;
    aiAutomationOpportunityCount: number;
  };
  employees: EmployeeAudit[];
};

const formatDuration = (seconds: number) => {
  const minutes = Math.round(Number(seconds || 0) / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return `${hours}h ${remainder.toString().padStart(2, "0")}m`;
};

const formatTaskMinutes = (minutes: number) =>
  minutes > 0 ? formatDuration(minutes * 60) : "Time not recorded";

type RangePreset = 7 | 30 | 60 | 90;

const toDateInputValue = (date: Date) => {
  const timezoneOffset = date.getTimezoneOffset();
  return new Date(date.getTime() - timezoneOffset * 60_000)
    .toISOString()
    .split("T")[0];
};

const getPresetRange = (days: RangePreset) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  };
};

const formatPeriod = (period: string) =>
  new Date(`${period}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

const getErrorMessage = (error: unknown) => {
  if (typeof error === "object" && error) {
    const response = (error as { response?: { data?: { message?: string } } })
      .response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error
    ? error.message
    : "The report could not be generated.";
};

const verdictStyle = (verdict: EmployeeAudit["ai"]["verdict"]) => {
  if (verdict === "LOOKS_GOOD") {
    return {
      label: "Looks good",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: CheckCircle2,
    };
  }
  if (verdict === "NEEDS_REVIEW") {
    return {
      label: "Needs human review",
      className: "bg-amber-50 text-amber-700 border-amber-200",
      icon: AlertTriangle,
    };
  }
  return {
    label:
      verdict === "INSUFFICIENT_DATA" ? "Insufficient data" : "Not analyzed",
    className: "bg-slate-50 text-slate-600 border-slate-200",
    icon: SearchCheck,
  };
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
      {label}
    </div>
    <div className="mt-1 text-sm font-black text-gray-900">{value}</div>
  </div>
);

export function EmployeeAiAuditPanel({ users }: { users: EmployeeOption[] }) {
  const [startDate, setStartDate] = useState(() => getPresetRange(7).startDate);
  const [endDate, setEndDate] = useState(() => getPresetRange(7).endDate);
  const [rangePreset, setRangePreset] = useState<RangePreset | "custom">(7);
  const [employeeId, setEmployeeId] = useState("");
  const [includeAi, setIncludeAi] = useState(true);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingTodoEod, setIsExportingTodoEod] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await api.post("/api/analytics/employee-ai-audit", {
        startDate,
        endDate,
        employeeId: employeeId || "ALL",
        includeAi,
      });
      setReport(response.data.data as AuditReport);
    } catch (requestError) {
      setReport(null);
      setError(getErrorMessage(requestError));
    } finally {
      setIsGenerating(false);
    }
  };

  const exportWorkbook = async () => {
    if (!report) return;
    setIsExporting(true);
    setError(null);
    try {
      const response = await api.post(
        "/api/analytics/employee-ai-audit/export",
        { report },
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `Employee_AI_Audit_${report.dateRange.startDate}_to_${report.dateRange.endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsExporting(false);
    }
  };

  const exportTodoEodArchive = async () => {
    setIsExportingTodoEod(true);
    setError(null);
    try {
      const response = await api.post(
        "/api/analytics/employee-ai-audit/todo-eod-export",
        {
          startDate,
          endDate,
          employeeId: employeeId || "ALL",
        },
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(
        new Blob([response.data], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `Todo_EOD_Reports_${startDate}_to_${endDate}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsExportingTodoEod(false);
    }
  };

  const employees = users.filter(
    (user) => user.role !== "SUPER_ADMIN" && user.role !== "ADMIN",
  );

  const applyRangePreset = (days: RangePreset) => {
    const range = getPresetRange(days);
    setRangePreset(days);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-indigo-700">
              <BrainCircuit className="h-5 w-5" />
              <h2 className="text-base font-black">Individual AI Work Audit</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Each employee is analyzed independently using their Todo plan, EOD
              tasks, attendance and every recorded application or domain. This
              includes research, reels, editing, marketplaces, communication,
              development and any other evidence found. Names are not sent to
              the AI provider.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-1.5 self-end rounded-xl border border-indigo-100 bg-white p-1">
              {([7, 30, 60, 90] as RangePreset[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => applyRangePreset(days)}
                  className={`rounded-lg px-2.5 py-2 text-xs font-bold transition ${
                    rangePreset === days
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
            <label className="text-xs font-bold text-gray-600">
              <span className="mb-1.5 block">
                From {rangePreset === "custom" ? "(custom)" : ""}
              </span>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => {
                  setRangePreset("custom");
                  setStartDate(event.target.value);
                }}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="text-xs font-bold text-gray-600">
              <span className="mb-1.5 block">To</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => {
                  setRangePreset("custom");
                  setEndDate(event.target.value);
                }}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="text-xs font-bold text-gray-600">
              <span className="mb-1.5 block">Employee</span>
              <select
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                className="min-w-52 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All employees</option>
                {employees.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>
                    {employee.name} ({employee.employeeId})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-10.5 cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700">
              <input
                type="checkbox"
                checked={includeAi}
                onChange={(event) => setIncludeAi(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
              />
              Run AI review
            </label>
            <button
              type="button"
              onClick={exportTodoEodArchive}
              disabled={
                isExportingTodoEod || !startDate || !endDate || isGenerating
              }
              className="flex h-10.5 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExportingTodoEod ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileArchive className="h-4 w-4" />
              )}
              {isExportingTodoEod ? "Building ZIP…" : "Download Todo + EOD ZIP"}
            </button>
            <button
              type="button"
              onClick={generateReport}
              disabled={isGenerating || !startDate || !endDate}
              className="flex h-10.5 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BrainCircuit className="h-4 w-4" />
              )}
              {isGenerating ? "Analyzing employees…" : "Generate AI audit"}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {isGenerating ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
          <h3 className="mt-4 font-bold text-gray-900">
            Analyzing every employee separately
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Application evidence is aggregated first, then each employee
            receives an independent AI review.
          </p>
        </div>
      ) : null}

      {!isGenerating && report ? (
        <>
          {!report.ai.configured && report.ai.requested ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <h3 className="text-sm font-black text-amber-900">
                    Evidence generated; Claude is not configured
                  </h3>
                  <p className="mt-1 text-sm text-amber-800">
                    Add <code>OPENROUTER_API_KEY</code> to the backend
                    environment. Claude Sonnet is used by default; you may also
                    set <code>OPENROUTER_MODEL</code>. the current default is{" "}
                    <code>{report.ai.model}</code>. Generate again after
                    restarting the backend.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-black text-gray-900">
                  Audit summary
                </h2>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  {report.dateRange.startDate} to {report.dateRange.endDate} ·{" "}
                  {report.summary.employeeCount} employee(s)
                </p>
              </div>
              <button
                type="button"
                onClick={exportWorkbook}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isExporting ? "Building Excel…" : "Download Excel workbook"}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric
                label="Looks good"
                value={String(report.summary.looksGoodCount)}
              />
              <Metric
                label="Needs review"
                value={String(report.summary.needsReviewCount)}
              />
              <Metric
                label="Not analyzed"
                value={String(
                  report.summary.notAnalyzedCount +
                    report.summary.insufficientDataCount,
                )}
              />
              <Metric
                label="Tracked"
                value={formatDuration(report.summary.totalTrackedSeconds)}
              />
              <Metric
                label="Coding agents"
                value={formatDuration(report.summary.codingAgentSeconds)}
              />
              <Metric
                label="Google Sheets"
                value={formatDuration(report.summary.googleSheetsSeconds)}
              />
              <Metric
                label="Recurring task groups"
                value={String(report.summary.repetitiveTaskCount)}
              />
              <Metric
                label="Recurring task time"
                value={formatTaskMinutes(report.summary.repetitiveTaskMinutes)}
              />
              <Metric
                label="Automation patterns"
                value={String(report.summary.automationCandidateCount)}
              />
              <Metric
                label="AI opportunities"
                value={String(report.summary.aiAutomationOpportunityCount)}
              />
            </div>
          </section>

          <div className="space-y-4">
            {report.employees.map((employee) => {
              const verdict = verdictStyle(employee.ai.verdict);
              const VerdictIcon = verdict.icon;
              return (
                <article
                  key={employee.employeeId}
                  className="[content-visibility:auto] rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-gray-900">
                          {employee.name}
                        </h3>
                        <p className="text-xs font-medium text-gray-500">
                          {employee.employeeId} · {employee.departmentName}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black ${verdict.className}`}
                    >
                      <VerdictIcon className="h-3.5 w-3.5" />
                      {verdict.label}
                      {employee.ai.status === "completed"
                        ? ` · ${employee.ai.confidence.toLocaleLowerCase()} confidence`
                        : ""}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
                        <Building2 className="h-4 w-4" /> Employment context
                      </div>
                      <dl className="mt-3 space-y-2 text-xs">
                        <div>
                          <dt className="font-bold text-gray-500">
                            Assigned department
                          </dt>
                          <dd className="mt-0.5 font-black text-gray-900">
                            {employee.employmentContext.assignedDepartment}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-gray-500">
                            Recorded responsibilities
                          </dt>
                          <dd className="mt-0.5 leading-5 text-gray-700">
                            {employee.employmentContext.departmentDescription ||
                              "No department description is recorded."}
                          </dd>
                        </div>
                        <div className="flex gap-5">
                          <div>
                            <dt className="font-bold text-gray-500">
                              Job title
                            </dt>
                            <dd className="mt-0.5 text-gray-700">
                              {employee.employmentContext.jobTitle ||
                                "Not recorded"}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-bold text-gray-500">
                              Platform role
                            </dt>
                            <dd className="mt-0.5 text-gray-700">
                              {employee.employmentContext.platformRole}
                            </dd>
                          </div>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-700">
                          <Repeat2 className="h-4 w-4" /> Repetition &
                          automation
                        </div>
                        <span className="text-[11px] font-bold text-violet-600">
                          {employee.metrics.repetitiveTaskCount} recurring ·{" "}
                          {employee.metrics.automationCandidateCount} pattern
                          candidate(s)
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Metric
                          label="Recurring task time"
                          value={formatTaskMinutes(
                            employee.metrics.repetitiveTaskMinutes,
                          )}
                        />
                        <Metric
                          label="Candidate time"
                          value={formatTaskMinutes(
                            employee.metrics.automationCandidateMinutes,
                          )}
                        />
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-gray-500">
                        Pattern candidates are only signals. The AI review below
                        confirms whether automation is realistic and explains
                        how.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                    <Metric
                      label="Todo completion"
                      value={`${employee.metrics.todoCompletionRate}%`}
                    />
                    <Metric
                      label="Todo ↔ EOD"
                      value={`${employee.metrics.todoEodAlignmentRate}%`}
                    />
                    <Metric
                      label="EOD coverage"
                      value={`${employee.coverage.eodDays}/${employee.coverage.daysInRange} days`}
                    />
                    <Metric
                      label="Counted outputs"
                      value={String(employee.metrics.eodActivityCount)}
                    />
                    <Metric
                      label="Tracked"
                      value={formatDuration(employee.metrics.trackedSeconds)}
                    />
                    <Metric
                      label="Focus score"
                      value={`${employee.metrics.focusScore}%`}
                    />
                    <Metric
                      label="Coding agents"
                      value={formatDuration(
                        employee.metrics.codingAgentSeconds,
                      )}
                    />
                    <Metric
                      label="Google Sheets"
                      value={formatDuration(
                        employee.metrics.googleSheetsSeconds,
                      )}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label: "Todo summary",
                        value: employee.summaries.todo,
                        className: "border-blue-100 bg-blue-50/50",
                      },
                      {
                        label: "EOD summary",
                        value: employee.summaries.eod,
                        className: "border-emerald-100 bg-emerald-50/50",
                      },
                      {
                        label: "Workload summary",
                        value: employee.summaries.workload,
                        className: "border-indigo-100 bg-indigo-50/50",
                      },
                      {
                        label: "Repetition summary",
                        value: employee.summaries.repetition,
                        className: "border-violet-100 bg-violet-50/50",
                      },
                    ].map((summary) => (
                      <div
                        key={summary.label}
                        className={`rounded-xl border p-3 ${summary.className}`}
                      >
                        <div className="text-[10px] font-black uppercase tracking-wide text-gray-500">
                          {summary.label}
                        </div>
                        <p className="mt-1.5 text-xs leading-5 text-gray-700">
                          {summary.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                      <h4 className="text-xs font-black uppercase tracking-wide text-gray-700">
                        Month-by-month summary
                      </h4>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        Compare Todo, EOD, calls and tracked time throughout the
                        selected custom range.
                      </p>
                    </div>
                    {employee.periodBreakdown.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-gray-500">
                        No activity was recorded for this period.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-xs">
                          <thead className="bg-white text-[10px] font-black uppercase tracking-wide text-gray-400">
                            <tr>
                              <th className="px-4 py-2.5">Month</th>
                              <th className="px-3 py-2.5">Todo days</th>
                              <th className="px-3 py-2.5">Todos complete</th>
                              <th className="px-3 py-2.5">EOD days</th>
                              <th className="px-3 py-2.5">EOD tasks</th>
                              <th className="px-3 py-2.5">EOD time</th>
                              <th className="px-3 py-2.5">Counted</th>
                              <th className="px-4 py-2.5">Tracked</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
                            {employee.periodBreakdown.map((period) => (
                              <tr key={period.period}>
                                <td className="whitespace-nowrap px-4 py-2.5 font-bold text-gray-900">
                                  {formatPeriod(period.period)}
                                </td>
                                <td className="px-3 py-2.5">
                                  {period.todoDays}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  {period.completedTodoItems}/
                                  {period.plannedTodoItems}
                                </td>
                                <td className="px-3 py-2.5">
                                  {period.eodDays}
                                </td>
                                <td className="px-3 py-2.5">
                                  {period.eodTasks}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  {formatTaskMinutes(period.eodMinutes)}
                                </td>
                                <td className="px-3 py-2.5">
                                  {period.activityCount}
                                </td>
                                <td className="whitespace-nowrap px-4 py-2.5 font-bold text-indigo-700">
                                  {formatDuration(period.trackedSeconds)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wide text-gray-700">
                          What this employee worked on
                        </h4>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          Time comes from EOD durations; Todo contributes
                          planning and repetition counts.
                        </p>
                      </div>
                      <span className="text-[11px] font-bold text-gray-500">
                        {employee.taskWorkSummary.length} task group(s)
                      </span>
                    </div>
                    {employee.taskWorkSummary.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-gray-500">
                        No Todo or EOD tasks were recorded for this period.
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {employee.taskWorkSummary
                          .slice(0, 8)
                          .map((task, index) => (
                            <div
                              key={`${task.task}-${index}`}
                              className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] md:items-center"
                            >
                              <div className="min-w-0">
                                <div className="truncate font-bold text-gray-900">
                                  {task.task}
                                </div>
                                {task.isRepetitive ? (
                                  <span
                                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
                                      task.automationSignal === "STRONG_PATTERN"
                                        ? "bg-violet-100 text-violet-700"
                                        : "bg-blue-50 text-blue-700"
                                    }`}
                                  >
                                    {task.automationSignal === "STRONG_PATTERN"
                                      ? "Automation pattern"
                                      : "Recurring task"}
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-gray-600">
                                <b className="text-gray-900">
                                  {task.eodOccurrences}
                                </b>{" "}
                                EOD
                              </span>
                              <span className="text-gray-600">
                                <b className="text-gray-900">
                                  {task.todoOccurrences}
                                </b>{" "}
                                Todo
                              </span>
                              <span className="text-gray-600">
                                {task.daysWorked} day(s)
                              </span>
                              <span className="text-gray-600">
                                <b className="text-blue-700">
                                  {task.activityCount}
                                </b>{" "}
                                counted
                              </span>
                              <span className="font-black text-indigo-700">
                                {formatTaskMinutes(task.totalMinutes)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                    {employee.taskWorkSummary.length > 8 ? (
                      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-medium text-gray-500">
                        {employee.taskWorkSummary.length - 8} more task group(s)
                        are included in the Excel workbook.
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-indigo-700">
                        <BrainCircuit className="h-4 w-4" />{" "}
                        {employee.ai.status === "completed"
                          ? "AI assessment"
                          : "Evidence assessment"}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-700">
                        {employee.ai.summary}
                      </p>
                      {employee.ai.error ? (
                        <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                          <span className="font-bold">
                            AI enhancement unavailable:
                          </span>{" "}
                          {employee.ai.error}
                        </p>
                      ) : null}
                      {employee.ai.todoEodAssessment ? (
                        <p className="mt-2 text-xs leading-5 text-gray-600">
                          <span className="font-bold text-gray-800">
                            Todo/EOD:
                          </span>{" "}
                          {employee.ai.todoEodAssessment}
                        </p>
                      ) : null}
                      {employee.ai.timeUseAssessment ? (
                        <p className="mt-1 text-xs leading-5 text-gray-600">
                          <span className="font-bold text-gray-800">
                            Time use:
                          </span>{" "}
                          {employee.ai.timeUseAssessment}
                        </p>
                      ) : null}
                      {employee.ai.applicationAssessment ? (
                        <p className="mt-1 text-xs leading-5 text-gray-600">
                          <span className="font-bold text-gray-800">
                            Applications:
                          </span>{" "}
                          {employee.ai.applicationAssessment}
                        </p>
                      ) : null}
                      {employee.ai.departmentAlignmentAssessment ? (
                        <p className="mt-1 text-xs leading-5 text-gray-600">
                          <span className="font-bold text-gray-800">
                            Department alignment:
                          </span>{" "}
                          {employee.ai.departmentAlignmentAssessment}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-gray-100 p-4">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-gray-500">
                        <Clock3 className="h-4 w-4" /> Tool evidence
                      </div>
                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 font-bold text-gray-700">
                            <Code2 className="h-3.5 w-3.5 text-indigo-500" />
                            Coding agents
                          </span>
                          <span className="text-right text-gray-600">
                            {employee.tools.codingAgents.length > 0
                              ? employee.tools.codingAgents
                                  .map(
                                    (tool) =>
                                      `${tool.tool} ${formatDuration(tool.seconds)}`,
                                  )
                                  .join(", ")
                              : "No usage found"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 font-bold text-gray-700">
                            <Sheet className="h-3.5 w-3.5 text-emerald-500" />
                            Google Sheets
                          </span>
                          <span className="text-right text-gray-600">
                            {formatDuration(
                              employee.metrics.googleSheetsSeconds,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 font-bold text-gray-700">
                            <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
                            Tracking detail
                          </span>
                          <span className="text-right text-gray-600">
                            {employee.coverage.toolTrackingDetail.replaceAll(
                              "_",
                              " ",
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-cyan-100 bg-cyan-50/30">
                    <div className="flex items-center justify-between gap-3 border-b border-cyan-100 px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-cyan-800">
                          <AppWindow className="h-4 w-4" /> All recorded
                          application activity
                        </div>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          Every aggregated application or domain below is sent
                          to the employee&apos;s AI review.
                        </p>
                      </div>
                      <span className="text-[11px] font-bold text-cyan-700">
                        {employee.appUsage.length} application group(s)
                      </span>
                    </div>
                    {employee.appUsage.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-gray-500">
                        No detailed application activity was recorded.
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-auto">
                        <table className="min-w-full text-left text-xs">
                          <thead className="sticky top-0 bg-white text-[10px] font-black uppercase tracking-wide text-gray-400">
                            <tr>
                              <th className="px-4 py-2.5">
                                Application / domain
                              </th>
                              <th className="px-3 py-2.5">Category</th>
                              <th className="px-3 py-2.5">Segments</th>
                              <th className="px-4 py-2.5 text-right">Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-cyan-50 bg-white/80 text-gray-700">
                            {employee.appUsage.map((app, index) => (
                              <tr key={`${app.app}-${index}`}>
                                <td className="px-4 py-2.5 font-bold text-gray-900">
                                  {app.app}
                                </td>
                                <td className="px-3 py-2.5">
                                  {app.productivityCategory.replaceAll(
                                    "_",
                                    " ",
                                  )}
                                </td>
                                <td className="px-3 py-2.5">
                                  {app.activitySegments}
                                </td>
                                <td className="whitespace-nowrap px-4 py-2.5 text-right font-black text-cyan-700">
                                  {formatDuration(app.seconds)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/30 p-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-blue-700">
                      <SearchCheck className="h-4 w-4" />{" "}
                      {employee.ai.status === "completed"
                        ? "AI analysis by work category"
                        : "Work analysis by category"}
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-gray-500">
                      {employee.ai.status === "completed"
                        ? "AI grouped the complete Todo, EOD and application evidence."
                        : "Built directly from the complete Todo, EOD and application evidence while AI enhancement is unavailable."}
                    </p>
                    {employee.ai.workCategoryAnalysis.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-600">
                        No work-category evidence is available for this employee
                        and date range.
                      </p>
                    ) : (
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {employee.ai.workCategoryAnalysis.map(
                          (category, index) => (
                            <div
                              key={`${category.category}-${index}`}
                              className="rounded-lg border border-blue-100 bg-white p-3"
                            >
                              <h5 className="text-sm font-black text-gray-900">
                                {category.category}
                              </h5>
                              <p className="mt-1 text-xs leading-5 text-gray-600">
                                {category.assessment}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold">
                                <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">
                                  Task time: {category.recordedTaskTime}
                                </span>
                                <span className="rounded-full bg-cyan-50 px-2 py-1 text-cyan-700">
                                  App time: {category.trackedApplicationTime}
                                </span>
                              </div>
                              {category.evidence.length > 0 ? (
                                <p className="mt-2 text-[11px] leading-5 text-gray-500">
                                  <span className="font-bold text-gray-700">
                                    Evidence:
                                  </span>{" "}
                                  {category.evidence.join(" • ")}
                                </p>
                              ) : null}
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-700">
                      <Sparkles className="h-4 w-4" />{" "}
                      {employee.ai.status === "completed"
                        ? "AI automation opportunities"
                        : "Automation pattern opportunities"}
                    </div>
                    {employee.ai.automationOpportunities.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-600">
                        No automation pattern was found in the available
                        evidence. Repetition alone is not treated as proof.
                      </p>
                    ) : (
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {employee.ai.automationOpportunities.map(
                          (opportunity, index) => (
                            <div
                              key={`${opportunity.task}-${index}`}
                              className="rounded-lg border border-violet-100 bg-white p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <h5 className="text-sm font-black text-gray-900">
                                  {opportunity.task}
                                </h5>
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">
                                  {opportunity.confidence.toLocaleLowerCase()}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-gray-600">
                                {opportunity.reason}
                              </p>
                              <p className="mt-2 text-xs leading-5 text-gray-700">
                                <span className="font-bold">
                                  Automate with:
                                </span>{" "}
                                {opportunity.automationApproach}
                              </p>
                              <p className="mt-1 text-[11px] font-bold text-violet-700">
                                Recorded time:{" "}
                                {opportunity.estimatedTimeInRange}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  {employee.ai.concerns.length > 0 ||
                  employee.ai.recommendations.length > 0 ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-black uppercase tracking-wide text-amber-700">
                          Items to verify
                        </div>
                        <ul className="mt-1.5 space-y-1 text-sm text-gray-600">
                          {employee.ai.concerns.map((concern) => (
                            <li key={concern}>• {concern}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs font-black uppercase tracking-wide text-indigo-700">
                          Operational follow-ups
                        </div>
                        <ul className="mt-1.5 space-y-1 text-sm text-gray-600">
                          {employee.ai.recommendations.map((recommendation) => (
                            <li key={recommendation}>• {recommendation}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      {!isGenerating && !report ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <BrainCircuit className="mx-auto h-10 w-10 text-indigo-300" />
          <h3 className="mt-3 font-black text-gray-900">
            Ready to build the individual audit
          </h3>
          <p className="mx-auto mt-1 max-w-xl text-sm text-gray-500">
            Choose a custom range up to 93 days, including the previous two or
            three months. The Excel workbook contains a team summary and a
            separate detailed sheet for every employee.
          </p>
        </div>
      ) : null}
    </div>
  );
}
