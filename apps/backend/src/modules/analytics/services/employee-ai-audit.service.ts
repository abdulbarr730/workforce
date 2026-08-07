import { AttendanceRecord } from "../../attendance/model/attendance-record.model";
import { DailyTodo } from "../../daily-flow/model/daily-todo.model";
import { EodReport } from "../../daily-flow/model/eod-report.model";
import { Department } from "../../departments/model/department.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { User } from "../../users/model/user.model";
import { EmployeeDailyAnalytics } from "../model/employee-daily-analytics.model";
import { EventType } from "../../../_shared/types";
import {
  extractJsonObject,
  getOpenRouterStatus,
  requestOpenRouterCompletion,
} from "./openrouter.service";

export type EmployeeAiVerdict =
  | "LOOKS_GOOD"
  | "NEEDS_REVIEW"
  | "INSUFFICIENT_DATA"
  | "NOT_ANALYZED";

export type EmployeeAiAssessment = {
  status: "completed" | "unavailable" | "failed" | "skipped";
  verdict: EmployeeAiVerdict;
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
  model?: string;
  error?: string;
};

export type ToolUsage = {
  tool: string;
  seconds: number;
  activitySegments: number;
};

export type TaskWorkSummary = {
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
};

export type EmployeeAiAudit = {
  employeeId: string;
  name: string;
  departmentName: string;
  role: string;
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
    presentDays: number;
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
    eodLoggedMinutes: number;
    todoEodAlignedItems: number;
    todoEodAlignmentRate: number;
    trackedSeconds: number;
    productiveSeconds: number;
    unproductiveSeconds: number;
    neutralSeconds: number;
    idleAndBreakSeconds: number;
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
  taskWorkSummary: TaskWorkSummary[];
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
  todos: Array<{
    date: string;
    items: Array<{
      text: string;
      done: boolean;
      estimatedTime: string;
      timeTaken: string;
    }>;
  }>;
  eods: Array<{
    date: string;
    submittedAt: string;
    summary: string;
    blockers: string;
    tasks: Array<{
      text: string;
      interval: string;
      timeTaken: string;
      count?: number;
      callCount?: number;
      isTopTask: boolean;
    }>;
  }>;
  ai: EmployeeAiAssessment;
};

export type EmployeeAiAuditReport = {
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
  employees: EmployeeAiAudit[];
};

const CODING_AGENT_PATTERNS: Array<[RegExp, string]> = [
  [/\bgithub copilot\b|\bcopilot\b/i, "GitHub Copilot"],
  [/\bcursor\b/i, "Cursor"],
  [/\bwindsurf\b|codeium/i, "Windsurf / Codeium"],
  [/\bclaude code\b/i, "Claude Code"],
  [/\bcodex\b/i, "Codex"],
  [/\bcline\b/i, "Cline"],
  [/\broo code\b|\broo-code\b/i, "Roo Code"],
  [/\baider\b/i, "Aider"],
  [/\bcontinue\b.*(?:dev|extension|agent)/i, "Continue"],
  [/gemini code assist/i, "Gemini Code Assist"],
  [/amazon q(?: developer)?/i, "Amazon Q Developer"],
  [/\bkiro\b/i, "Kiro"],
  [/\breplit agent\b/i, "Replit Agent"],
  [/\blovable\b/i, "Lovable"],
];

const DEVELOPMENT_TOOL_PATTERNS: Array<[RegExp, string]> = [
  [/visual studio code|\bcode\.exe\b|\bvscode\b/i, "Visual Studio Code"],
  [/visual studio(?! code)/i, "Visual Studio"],
  [/\bpycharm\b/i, "PyCharm"],
  [/\bwebstorm\b/i, "WebStorm"],
  [/\bintellij\b/i, "IntelliJ IDEA"],
  [/android studio/i, "Android Studio"],
  [/\bzed\b/i, "Zed"],
  [/windows terminal|\bterminal\b/i, "Terminal"],
  [/powershell/i, "PowerShell"],
  [/command prompt|\bcmd\.exe\b/i, "Command Prompt"],
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
  "work",
  "task",
]);

const AUTOMATION_PATTERN =
  /\b(report(?:ing)?|follow[ -]?ups?|data entry|copy(?:ing)?|upload(?:ing)?|download(?:ing)?|sync(?:ing)?|reminders?|notifications?|status updates?|spreadsheet|sheets? updates?|whatsapp check|email check|daily checks?|todo|eod|reconciliation)\b/i;

const EMPLOYEE_AI_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: {
      type: "string",
      enum: ["LOOKS_GOOD", "NEEDS_REVIEW", "INSUFFICIENT_DATA"],
    },
    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    summary: { type: "string" },
    timeUseAssessment: { type: "string" },
    applicationAssessment: { type: "string" },
    todoEodAssessment: { type: "string" },
    departmentAlignmentAssessment: { type: "string" },
    workCategoryAnalysis: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          evidence: { type: "array", items: { type: "string" }, maxItems: 6 },
          recordedTaskTime: { type: "string" },
          trackedApplicationTime: { type: "string" },
          assessment: { type: "string" },
        },
        required: [
          "category",
          "evidence",
          "recordedTaskTime",
          "trackedApplicationTime",
          "assessment",
        ],
      },
    },
    automationOpportunities: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          task: { type: "string" },
          reason: { type: "string" },
          estimatedTimeInRange: { type: "string" },
          automationApproach: { type: "string" },
          confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
        },
        required: [
          "task",
          "reason",
          "estimatedTimeInRange",
          "automationApproach",
          "confidence",
        ],
      },
    },
    strengths: { type: "array", items: { type: "string" }, maxItems: 6 },
    concerns: { type: "array", items: { type: "string" }, maxItems: 6 },
    recommendations: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
    },
  },
  required: [
    "verdict",
    "confidence",
    "summary",
    "timeUseAssessment",
    "applicationAssessment",
    "todoEodAssessment",
    "departmentAlignmentAssessment",
    "workCategoryAnalysis",
    "automationOpportunities",
    "strengths",
    "concerns",
    "recommendations",
  ],
};

const safeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const clampDurationSeconds = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(number, 305) : 30;
};

const round = (value: number) => Math.round(value * 100) / 100;

const durationToMinutes = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 0;

  const clockWithSeconds = normalized.match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
  if (clockWithSeconds) {
    return (
      Number(clockWithSeconds[1]) * 60 +
      Number(clockWithSeconds[2]) +
      Number(clockWithSeconds[3]) / 60
    );
  }

  const clock = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  const hours = normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  const minutes = normalized.match(
    /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/,
  );
  return Math.round(Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0));
};

const extractLegacyTaskDuration = (value: unknown) => {
  const originalText = safeString(value);
  const clockDuration = originalText.match(/\b\d{1,3}:[0-5]\d:[0-5]\d\b/)?.[0];
  const writtenDurations = Array.from(
    originalText.matchAll(
      /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/gi,
    ),
  );
  const writtenDuration = writtenDurations.at(-1)?.[0];
  const timeTaken = clockDuration || writtenDuration || "";

  let text = originalText;
  if (timeTaken) {
    text = text.replace(timeTaken, "");
  }
  text = text
    .replace(/^[\s|•⭐*\-–—]+/u, "")
    .replace(/[\s|\-–—]+(?:\([^)]*\))?\s*$/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    text: text || originalText,
    timeTaken,
  };
};

const formatMinutesLabel = (minutes: number) => {
  if (minutes <= 0) return "no duration recorded";
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  if (hours === 0) return `${remainder}m`;
  return `${hours}h ${remainder.toString().padStart(2, "0")}m`;
};

const WORK_CATEGORY_PATTERNS: Array<{
  category: string;
  pattern: RegExp;
}> = [
  {
    category: "Marketplace & product research",
    pattern:
      /\b(amazon|flipkart|marketplace|product research|research sheet|competitor|listing|keyword|platinum research)\b/i,
  },
  {
    category: "Reels, content & editing",
    pattern:
      /\b(reels?|video|editing?|content|creative|thumbnail|photoshop|premiere|capcut|canva)\b/i,
  },
  {
    category: "Marketing & campaigns",
    pattern:
      /\b(campaign|marketing|mailer|mailerlite|promotion|social media|ads?|broadcast)\b/i,
  },
  {
    category: "Communication, calls & follow-ups",
    pattern:
      /\b(call|calls|follow[ -]?up|whatsapp|email|message|query|support|lead|client|member|connected)\b/i,
  },
  {
    category: "Meetings & coordination",
    pattern: /\b(meeting|discussion|coordinate|coordination|review|standup)\b/i,
  },
  {
    category: "Development & technical work",
    pattern:
      /\b(development|develop|coding|code|api|bug|testing|github|vscode|visual studio|terminal|codex|cursor|software)\b/i,
  },
  {
    category: "Reporting, spreadsheets & administration",
    pattern:
      /\b(report|reporting|todo|eod|spreadsheet|sheets?|excel|data entry|documentation|document|admin|update)\b/i,
  },
];

const getWorkCategory = (value: string) =>
  WORK_CATEGORY_PATTERNS.find(({ pattern }) => pattern.test(value))?.category ||
  "Other recorded work";

const getAutomationApproach = (task: string) => {
  if (/\b(call|follow[ -]?up|whatsapp|email|message|lead)\b/i.test(task)) {
    return "Use a CRM queue with scheduled reminders, reusable message templates, status capture, and human approval before sending.";
  }
  if (/\b(report|todo|eod|sheet|spreadsheet|data entry|update)\b/i.test(task)) {
    return "Use structured forms plus spreadsheet/API automation to collect the data once and generate recurring updates automatically.";
  }
  if (
    /\b(research|amazon|marketplace|listing|competitor|keyword)\b/i.test(task)
  ) {
    return "Use a repeatable research template with approved data sources and AI-assisted extraction, followed by employee validation.";
  }
  if (/\b(upload|download|sync|copy)\b/i.test(task)) {
    return "Use a scheduled integration or script with validation and an exception queue for failed items.";
  }
  return "Standardize the steps in a reusable workflow, then automate the repeatable parts while keeping a human review checkpoint.";
};

const buildEvidenceFallback = (
  employee: Omit<EmployeeAiAudit, "ai">,
): Pick<
  EmployeeAiAssessment,
  | "summary"
  | "timeUseAssessment"
  | "applicationAssessment"
  | "todoEodAssessment"
  | "departmentAlignmentAssessment"
  | "workCategoryAnalysis"
  | "automationOpportunities"
  | "strengths"
  | "concerns"
  | "recommendations"
> => {
  const categories = new Map<
    string,
    { tasks: TaskWorkSummary[]; applications: EmployeeAiAudit["appUsage"] }
  >();
  const getCategory = (category: string) => {
    const current = categories.get(category) || {
      tasks: [],
      applications: [],
    };
    categories.set(category, current);
    return current;
  };

  employee.taskWorkSummary.forEach((task) => {
    getCategory(
      getWorkCategory([task.task, ...task.examples].join(" ")),
    ).tasks.push(task);
  });
  employee.appUsage.forEach((application) => {
    getCategory(getWorkCategory(application.app)).applications.push(
      application,
    );
  });

  const workCategoryAnalysis = Array.from(categories.entries())
    .map(([category, value]) => {
      const taskMinutes = value.tasks.reduce(
        (total, task) => total + task.totalMinutes,
        0,
      );
      const applicationSeconds = value.applications.reduce(
        (total, application) => total + application.seconds,
        0,
      );
      const evidence = Array.from(
        new Set([
          ...value.tasks.map((task) => `Task: ${task.task}`),
          ...value.applications.map(
            (application) => `Application: ${application.app}`,
          ),
        ]),
      ).slice(0, 6);
      return {
        category,
        evidence,
        recordedTaskTime: formatMinutesLabel(taskMinutes),
        trackedApplicationTime: formatMinutesLabel(applicationSeconds / 60),
        assessment: `${value.tasks.length} task group(s) and ${value.applications.length} application/domain group(s) were assigned to this category from the recorded evidence.`,
        sortSeconds: taskMinutes * 60 + applicationSeconds,
      };
    })
    .sort((left, right) => right.sortSeconds - left.sortSeconds)
    .map(({ sortSeconds: _sortSeconds, ...category }) => category);

  const automationOpportunities = employee.taskWorkSummary
    .filter((task) => task.automationSignal === "STRONG_PATTERN")
    .slice(0, 8)
    .map((task) => ({
      task: task.task,
      reason: `${task.eodOccurrences} EOD occurrence(s) and ${task.todoOccurrences} Todo occurrence(s) were recorded across ${task.daysWorked} day(s). This is an evidence-based pattern candidate, not an automatic decision.`,
      estimatedTimeInRange: formatMinutesLabel(task.totalMinutes),
      automationApproach: getAutomationApproach(task.task),
      confidence:
        task.daysWorked >= 3 || task.eodOccurrences >= 3
          ? ("HIGH" as const)
          : ("MEDIUM" as const),
    }));
  const leadingApplications = employee.appUsage
    .slice(0, 5)
    .map(
      (application) =>
        `${application.app} (${formatMinutesLabel(application.seconds / 60)})`,
    );

  return {
    summary: `${employee.taskWorkSummary.length} Todo/EOD task group(s) and ${employee.appUsage.length} recorded application/domain group(s) were categorized from the available evidence.`,
    timeUseAssessment: `${formatMinutesLabel(employee.metrics.eodLoggedMinutes)} was recorded in EOD task durations and ${formatMinutesLabel(employee.metrics.trackedSeconds / 60)} was recorded by application tracking. These totals measure different evidence and should not be expected to match exactly.`,
    applicationAssessment:
      leadingApplications.length > 0
        ? `The leading recorded applications/domains were ${leadingApplications.join(", ")}. The full application list is included below.`
        : "No detailed application/domain evidence was available for this period.",
    todoEodAssessment: `${employee.metrics.completedTodoItems} of ${employee.metrics.plannedTodoItems} Todo items were marked complete, with ${employee.metrics.todoEodAlignmentRate}% text alignment between planned Todo items and reported EOD work.`,
    departmentAlignmentAssessment:
      employee.employmentContext.contextCoverage === "DEPARTMENT_DESCRIPTION"
        ? "Recorded work categories are available for comparison with the department description; final alignment requires AI or human review."
        : "Formal department responsibilities are not recorded, so department alignment cannot be determined reliably.",
    workCategoryAnalysis,
    automationOpportunities,
    strengths: [],
    concerns: [],
    recommendations: automationOpportunities.map(
      (opportunity) => `Review the workflow for ${opportunity.task}.`,
    ),
  };
};

const getDateRangeDays = (startDate: string, endDate: string) =>
  Math.floor(
    (Date.parse(`${endDate}T00:00:00.000Z`) -
      Date.parse(`${startDate}T00:00:00.000Z`)) /
      86_400_000,
  ) + 1;

const tokenize = (value: string) =>
  new Set(
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );

const tasksAlign = (todo: string, eod: string) => {
  const leftText = todo.trim().toLocaleLowerCase();
  const rightText = eod.trim().toLocaleLowerCase();
  if (!leftText || !rightText) return false;
  if (leftText.includes(rightText) || rightText.includes(leftText)) return true;

  const left = tokenize(leftText);
  const right = tokenize(rightText);
  if (left.size === 0 || right.size === 0) return false;
  let common = 0;
  left.forEach((token) => {
    if (right.has(token)) common += 1;
  });
  return common / Math.min(left.size, right.size) >= 0.6;
};

const buildTaskWorkSummary = (
  todos: EmployeeAiAudit["todos"],
  eods: EmployeeAiAudit["eods"],
): TaskWorkSummary[] => {
  type MutableTaskSummary = Omit<
    TaskWorkSummary,
    "daysWorked" | "averageMinutes" | "isRepetitive" | "automationSignal"
  > & { dates: Set<string> };
  const groups: MutableTaskSummary[] = [];

  const findOrCreate = (task: string) => {
    let group = groups.find((candidate) => tasksAlign(candidate.task, task));
    if (!group) {
      group = {
        task,
        examples: [],
        todoOccurrences: 0,
        completedTodoOccurrences: 0,
        eodOccurrences: 0,
        totalMinutes: 0,
        activityCount: 0,
        callCount: 0,
        dates: new Set<string>(),
      };
      groups.push(group);
    }
    if (
      task &&
      !group.examples.some(
        (example) => example.toLocaleLowerCase() === task.toLocaleLowerCase(),
      ) &&
      group.examples.length < 4
    ) {
      group.examples.push(task);
    }
    return group;
  };

  eods.forEach((eod) => {
    eod.tasks.forEach((task) => {
      if (!task.text) return;
      const group = findOrCreate(task.text);
      group.eodOccurrences += 1;
      group.totalMinutes += durationToMinutes(task.timeTaken);
      group.activityCount += Number(task.count || task.callCount || 0);
      group.callCount += Number(task.callCount || 0);
      group.dates.add(eod.date);
    });
  });

  todos.forEach((todo) => {
    todo.items.forEach((item) => {
      if (!item.text) return;
      const group = findOrCreate(item.text);
      group.todoOccurrences += 1;
      if (item.done) group.completedTodoOccurrences += 1;
      group.dates.add(todo.date);
    });
  });

  return groups
    .map((group) => {
      const daysWorked = group.dates.size;
      const occurrences = Math.max(group.eodOccurrences, group.todoOccurrences);
      const isRepetitive = occurrences >= 2 || daysWorked >= 2;
      const automationSignal =
        isRepetitive && AUTOMATION_PATTERN.test(group.task)
          ? "STRONG_PATTERN"
          : isRepetitive
            ? "RECURRING_REVIEW"
            : "NONE";
      return {
        task: group.task,
        examples: group.examples,
        todoOccurrences: group.todoOccurrences,
        completedTodoOccurrences: group.completedTodoOccurrences,
        eodOccurrences: group.eodOccurrences,
        daysWorked,
        totalMinutes: Math.round(group.totalMinutes),
        averageMinutes:
          group.eodOccurrences > 0
            ? Math.round(group.totalMinutes / group.eodOccurrences)
            : 0,
        activityCount: group.activityCount,
        callCount: group.callCount,
        isRepetitive,
        automationSignal,
      } satisfies TaskWorkSummary;
    })
    .sort(
      (left, right) =>
        right.totalMinutes - left.totalMinutes ||
        right.eodOccurrences - left.eodOccurrences ||
        right.todoOccurrences - left.todoOccurrences,
    );
};

const identifySpecialTool = (searchText: string) => {
  if (
    /docs\.google\.com\/spreadsheets|google sheets|sheets\.google\.com/i.test(
      searchText,
    )
  ) {
    return { category: "GOOGLE_SHEETS" as const, tool: "Google Sheets" };
  }

  const codingAgent = CODING_AGENT_PATTERNS.find(([pattern]) =>
    pattern.test(searchText),
  );
  if (codingAgent) {
    return { category: "CODING_AGENT" as const, tool: codingAgent[1] };
  }

  const developmentTool = DEVELOPMENT_TOOL_PATTERNS.find(([pattern]) =>
    pattern.test(searchText),
  );
  if (developmentTool) {
    return {
      category: "DEVELOPMENT_TOOL" as const,
      tool: developmentTool[1],
    };
  }

  return null;
};

const addToolUsage = (
  target: Map<string, ToolUsage>,
  tool: string,
  seconds: number,
  segments = 1,
) => {
  const current = target.get(tool) || { tool, seconds: 0, activitySegments: 0 };
  current.seconds += seconds;
  current.activitySegments += segments;
  target.set(tool, current);
};

const sortedToolUsage = (values: Map<string, ToolUsage>) =>
  Array.from(values.values())
    .map((value) => ({ ...value, seconds: Math.round(value.seconds) }))
    .sort((left, right) => right.seconds - left.seconds);

const asStringArray = (value: unknown, limit = 6) =>
  (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);

const normalizeAiAssessment = (
  value: unknown,
  model: string,
): EmployeeAiAssessment => {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const verdict = ["LOOKS_GOOD", "NEEDS_REVIEW", "INSUFFICIENT_DATA"].includes(
    String(record.verdict),
  )
    ? (String(record.verdict) as EmployeeAiVerdict)
    : "INSUFFICIENT_DATA";
  const confidence = ["LOW", "MEDIUM", "HIGH"].includes(
    String(record.confidence),
  )
    ? (String(record.confidence) as "LOW" | "MEDIUM" | "HIGH")
    : "LOW";

  return {
    status: "completed",
    verdict,
    confidence,
    summary: safeString(record.summary) || "No AI summary returned.",
    timeUseAssessment: safeString(record.timeUseAssessment),
    applicationAssessment: safeString(record.applicationAssessment),
    todoEodAssessment: safeString(record.todoEodAssessment),
    departmentAlignmentAssessment: safeString(
      record.departmentAlignmentAssessment,
    ),
    workCategoryAnalysis: (Array.isArray(record.workCategoryAnalysis)
      ? record.workCategoryAnalysis
      : []
    )
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => ({
        category: safeString(item.category),
        evidence: asStringArray(item.evidence, 6),
        recordedTaskTime: safeString(item.recordedTaskTime),
        trackedApplicationTime: safeString(item.trackedApplicationTime),
        assessment: safeString(item.assessment),
      }))
      .filter((item) => item.category && item.assessment)
      .slice(0, 12),
    automationOpportunities: (Array.isArray(record.automationOpportunities)
      ? record.automationOpportunities
      : []
    )
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => ({
        task: safeString(item.task),
        reason: safeString(item.reason),
        estimatedTimeInRange: safeString(item.estimatedTimeInRange),
        automationApproach: safeString(item.automationApproach),
        confidence: ["LOW", "MEDIUM", "HIGH"].includes(String(item.confidence))
          ? (String(item.confidence) as "LOW" | "MEDIUM" | "HIGH")
          : "LOW",
      }))
      .filter((item) => item.task && item.reason)
      .slice(0, 8),
    strengths: asStringArray(record.strengths),
    concerns: asStringArray(record.concerns),
    recommendations: asStringArray(record.recommendations),
    model,
  };
};

const analyzeEmployee = async (
  employee: Omit<EmployeeAiAudit, "ai">,
): Promise<EmployeeAiAssessment> => {
  const evidence = {
    employmentContext: employee.employmentContext,
    coverage: employee.coverage,
    metrics: employee.metrics,
    deterministicSummaries: employee.summaries,
    periodBreakdown: employee.periodBreakdown,
    tools: employee.tools,
    evidenceCoverage: {
      taskGroups: employee.taskWorkSummary.length,
      applicationGroups: employee.appUsage.length,
    },
    applicationTupleFields: [
      "applicationOrDomain",
      "seconds",
      "activitySegments",
      "productivityCategory",
    ],
    taskGroupTupleFields: [
      "task",
      "todoOccurrences",
      "completedTodoOccurrences",
      "eodOccurrences",
      "daysWorked",
      "eodMinutes",
      "activityCount",
      "callCount",
      "automationSignal",
    ],
    // Compact tuples keep every aggregated group in the prompt without
    // repeating verbose object keys for large custom date ranges.
    allRecordedApplications: employee.appUsage.map((app) => [
      app.app,
      app.seconds,
      app.activitySegments,
      app.productivityCategory,
    ]),
    allTaskGroups: employee.taskWorkSummary.map((task) => [
      task.task,
      task.todoOccurrences,
      task.completedTodoOccurrences,
      task.eodOccurrences,
      task.daysWorked,
      task.totalMinutes,
      task.activityCount,
      task.callCount,
      task.automationSignal,
    ]),
    blockerSamples: employee.eods
      .map((eod) => eod.blockers)
      .filter(Boolean)
      .slice(0, 10),
  };

  const result = await requestOpenRouterCompletion({
    messages: [
      {
        role: "system",
        content:
          "You are a careful workforce operations analyst. Evaluate only the supplied operational evidence. Never infer personal traits or recommend hiring, firing, promotion, compensation, or disciplinary action. Treat tracking gaps as missing data, not poor performance.",
      },
      {
        role: "user",
        content: `Assess one employee independently. Compare Todo plans with EOD work and evaluate every supplied task group and every recorded application/domain—not only coding agents and Google Sheets. Group related work into clear operational categories such as marketplace or Amazon research, reels or content research, editing, communication, meetings, development, reporting, sales, and administration when the evidence supports them. Do not silently ignore an unfamiliar task or application: place it in the best evidence-based category or label it as other/unclear. Explain which work categories consume time, how application activity supports or conflicts with the Todo/EOD descriptions, detect genuinely repetitive work, and identify concrete automation opportunities. Compare the work with the recorded department description when one exists; if only a department name exists, say that formal responsibilities are unavailable and avoid guessing. Decide whether the evidence LOOKS_GOOD, NEEDS_REVIEW, or is INSUFFICIENT_DATA. NEEDS_REVIEW means a human should verify a concrete inconsistency; it is not a disciplinary decision.

Return only one JSON object using exactly these keys:
{
  "verdict": "LOOKS_GOOD | NEEDS_REVIEW | INSUFFICIENT_DATA",
  "confidence": "LOW | MEDIUM | HIGH",
  "summary": "2-4 evidence-based sentences",
  "timeUseAssessment": "concise assessment with exact durations where useful",
  "applicationAssessment": "assessment covering the full recorded application/domain list and its relationship to reported work",
  "todoEodAssessment": "concise comparison of planned and reported work",
  "departmentAlignmentAssessment": "what the work suggests relative to the recorded department, with data limitations",
  "workCategoryAnalysis": [{"category":"evidence-based work category","evidence":["Todo, EOD task, or application evidence"],"recordedTaskTime":"EOD task time for this category or not recorded","trackedApplicationTime":"related tracked application time or not available","assessment":"concise evidence-based analysis"}],
  "automationOpportunities": [{"task":"repetitive task name","reason":"evidence for repetition and suitability","estimatedTimeInRange":"recorded time that could be affected","automationApproach":"specific workflow, integration, template, script, or agent","confidence":"LOW | MEDIUM | HIGH"}],
  "strengths": ["evidence-based item"],
  "concerns": ["specific item to verify"],
  "recommendations": ["neutral operational follow-up"]
}

Operational evidence (the employee identity has deliberately not been sent):
${JSON.stringify(evidence)}`,
      },
    ],
    maxCompletionTokens: 2_400,
    jsonSchema: {
      name: "employee_work_audit",
      schema: EMPLOYEE_AI_RESPONSE_SCHEMA,
    },
  });

  return normalizeAiAssessment(extractJsonObject(result.content), result.model);
};

const mapWithConcurrency = async <T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) => {
  const output = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        output[index] = await mapper(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return output;
};

export const generateEmployeeAiAudit = async ({
  startDate,
  endDate,
  employeeId,
  includeAi = true,
}: {
  startDate: string;
  endDate: string;
  employeeId?: string;
  includeAi?: boolean;
}): Promise<EmployeeAiAuditReport> => {
  const userFilter: Record<string, unknown> = {
    role: { $nin: ["SUPER_ADMIN", "ADMIN"] },
  };
  if (employeeId && employeeId !== "ALL") userFilter.employeeId = employeeId;

  const users = await User.find(userFilter)
    .select("employeeId name departmentId departmentName role")
    .sort({ name: 1 })
    .lean();
  const employeeIds = users.map((user) => user.employeeId);
  const dateFilter = { $gte: startDate, $lte: endDate };
  const eventStart = new Date(`${startDate}T00:00:00.000+05:30`);
  const eventEnd = new Date(`${endDate}T23:59:59.999+05:30`);

  const [todos, eods, attendance, analytics, events, departments] =
    await Promise.all([
      DailyTodo.find({ employeeId: { $in: employeeIds }, date: dateFilter })
        .sort({ date: 1 })
        .lean(),
      EodReport.find({ employeeId: { $in: employeeIds }, date: dateFilter })
        .sort({ date: 1 })
        .lean(),
      AttendanceRecord.find({
        employeeId: { $in: employeeIds },
        date: dateFilter,
        deleted: { $ne: true },
      })
        .sort({ date: 1 })
        .lean(),
      EmployeeDailyAnalytics.find({
        employeeId: { $in: employeeIds },
        date: dateFilter,
      })
        .sort({ date: 1 })
        .lean(),
      ActivityEvent.find({
        employeeId: { $in: employeeIds },
        type: EventType.ACTIVE_WINDOW,
        invalidated: { $ne: true },
        timestamp: { $gte: eventStart, $lte: eventEnd },
      })
        .select(
          "employeeId timestamp metadata productivityCategory productivityScore",
        )
        .lean(),
      Department.find({ isActive: { $ne: false } })
        .select("_id name description")
        .lean(),
    ]);

  const daysInRange = getDateRangeDays(startDate, endDate);

  const withoutAi: Array<Omit<EmployeeAiAudit, "ai">> = users.map((user) => {
    const employeeTodos = (todos as any[]).filter(
      (todo) => todo.employeeId === user.employeeId,
    );
    const employeeEods = (eods as any[]).filter(
      (eod) => eod.employeeId === user.employeeId,
    );
    const employeeAttendance = (attendance as any[]).filter(
      (record) => record.employeeId === user.employeeId,
    );
    const employeeAnalytics = (analytics as any[]).filter(
      (record) => record.employeeId === user.employeeId,
    );
    const employeeEvents = (events as any[]).filter(
      (event) => event.employeeId === user.employeeId,
    );

    const formattedTodos = employeeTodos.map((todo) => ({
      date: todo.date,
      items: (todo.items || []).map((item: any) => ({
        text: safeString(item.text),
        done: Boolean(item.done),
        estimatedTime: safeString(item.estimatedTime),
        timeTaken: safeString(item.timeTaken),
      })),
    }));

    const formattedEods = employeeEods.map((eod) => {
      const structuredTasks = Array.isArray(eod.tasksWithTimings)
        ? eod.tasksWithTimings
        : [];
      const tasks =
        structuredTasks.length > 0
          ? structuredTasks.map((task: any) => ({
              text: safeString(task.text),
              interval: safeString(task.interval),
              timeTaken: safeString(task.timeTaken),
              count:
                Number.isFinite(Number(task.count ?? task.callCount)) &&
                Number(task.count ?? task.callCount) > 0
                  ? Number(task.count ?? task.callCount)
                  : undefined,
              callCount:
                Number.isFinite(Number(task.callCount)) &&
                Number(task.callCount) > 0
                  ? Number(task.callCount)
                  : undefined,
              isTopTask: Boolean(task.isTopTask),
            }))
          : (eod.completedItems || []).map((text: string) => {
              const legacyTask = extractLegacyTaskDuration(text);
              return {
                text: legacyTask.text,
                interval: "",
                timeTaken: legacyTask.timeTaken,
                count: undefined,
                callCount: undefined,
                isTopTask: (eod.top3Tasks || []).includes(text),
              };
            });

      return {
        date: eod.date,
        submittedAt: eod.submittedAt
          ? new Date(eod.submittedAt).toISOString()
          : "",
        summary: safeString(eod.summary),
        blockers: safeString(eod.blockers),
        tasks,
      };
    });

    const plannedItems = formattedTodos.flatMap((todo) => todo.items);
    const eodTasks = formattedEods.flatMap((eod) => eod.tasks);
    const taskWorkSummary = buildTaskWorkSummary(formattedTodos, formattedEods);
    const repetitiveTasks = taskWorkSummary.filter((task) => task.isRepetitive);
    const automationCandidates = taskWorkSummary.filter(
      (task) => task.automationSignal === "STRONG_PATTERN",
    );
    const assignedDepartment = (departments as any[]).find(
      (department) =>
        (user.departmentId &&
          String(department._id) === String(user.departmentId)) ||
        (user.departmentName &&
          safeString(department.name).toLocaleLowerCase() ===
            safeString(user.departmentName).toLocaleLowerCase()),
    );
    const departmentName =
      safeString(assignedDepartment?.name) ||
      safeString(user.departmentName) ||
      "Unassigned";
    const departmentDescription = safeString(assignedDepartment?.description);
    const alignedItems = plannedItems.filter((todo) =>
      eodTasks.some((task) => tasksAlign(todo.text, task.text)),
    ).length;

    let productiveSeconds = 0;
    let unproductiveSeconds = 0;
    let neutralSeconds = 0;
    employeeAnalytics.forEach((record) => {
      productiveSeconds += Number(record.productiveSeconds || 0);
      unproductiveSeconds += Number(record.unproductiveSeconds || 0);
      neutralSeconds += Number(record.neutralSeconds || 0);
    });

    const codingAgents = new Map<string, ToolUsage>();
    const googleSheets = new Map<string, ToolUsage>();
    const developmentTools = new Map<string, ToolUsage>();
    const appMap = new Map<
      string,
      {
        app: string;
        seconds: number;
        activitySegments: number;
        categories: Map<string, number>;
      }
    >();

    employeeEvents.forEach((event) => {
      const metadata = event.metadata || {};
      const durationSeconds = clampDurationSeconds(metadata.durationSeconds);
      const app = safeString(metadata.app) || "Unknown application";
      const domain = safeString(metadata.domain);
      const title = safeString(metadata.title);
      const url = safeString(metadata.url);
      const specialTool = identifySpecialTool(
        `${app} ${domain} ${title} ${url}`,
      );
      const displayApp = specialTool?.tool || domain || app;
      const appKey = displayApp.toLocaleLowerCase();
      const current = appMap.get(appKey) || {
        app: displayApp,
        seconds: 0,
        activitySegments: 0,
        categories: new Map<string, number>(),
      };
      current.seconds += durationSeconds;
      current.activitySegments += 1;
      const category = safeString(event.productivityCategory) || "NEUTRAL";
      current.categories.set(
        category,
        (current.categories.get(category) || 0) + durationSeconds,
      );
      appMap.set(appKey, current);

      if (specialTool?.category === "CODING_AGENT") {
        addToolUsage(codingAgents, specialTool.tool, durationSeconds);
      } else if (specialTool?.category === "GOOGLE_SHEETS") {
        addToolUsage(googleSheets, specialTool.tool, durationSeconds);
      } else if (specialTool?.category === "DEVELOPMENT_TOOL") {
        addToolUsage(developmentTools, specialTool.tool, durationSeconds);
      }
    });

    // Daily analytics survives longer than raw window events. Use it as a
    // fallback for application totals, while clearly flagging reduced detail.
    if (employeeEvents.length === 0) {
      employeeAnalytics.forEach((record) => {
        (record.topApps || []).forEach((appEntry: any) => {
          const app = safeString(appEntry.app) || "Unknown application";
          const seconds = Number(appEntry.seconds || 0);
          const specialTool = identifySpecialTool(app);
          const displayApp = specialTool?.tool || app;
          const key = displayApp.toLocaleLowerCase();
          const current = appMap.get(key) || {
            app: displayApp,
            seconds: 0,
            activitySegments: 0,
            categories: new Map<string, number>(),
          };
          current.seconds += seconds;
          appMap.set(key, current);
          if (specialTool?.category === "CODING_AGENT") {
            addToolUsage(codingAgents, specialTool.tool, seconds, 0);
          } else if (specialTool?.category === "DEVELOPMENT_TOOL") {
            addToolUsage(developmentTools, specialTool.tool, seconds, 0);
          }
        });
      });
    }

    const codingAgentList = sortedToolUsage(codingAgents);
    const googleSheetsList = sortedToolUsage(googleSheets);
    const developmentToolList = sortedToolUsage(developmentTools);
    const trackedSeconds =
      productiveSeconds + unproductiveSeconds + neutralSeconds;
    const topApps = Array.from(appMap.values())
      .map((app) => {
        const category = Array.from(app.categories.entries()).sort(
          (left, right) => right[1] - left[1],
        )[0]?.[0];
        return {
          app: app.app,
          seconds: Math.round(app.seconds),
          activitySegments: app.activitySegments,
          productivityCategory: category || "UNKNOWN",
        };
      })
      .sort((left, right) => right.seconds - left.seconds);
    const presentDays = employeeAttendance.filter((record) =>
      ["PRESENT", "LATE", "HALF_DAY"].includes(record.attendanceStatus),
    ).length;
    const idleAndBreakSeconds = employeeAttendance.reduce(
      (total, record) =>
        total +
        (Number(record.idleMinutes || 0) + Number(record.breakMinutes || 0)) *
          60,
      0,
    );
    const completedTodoItems = plannedItems.filter((item) => item.done).length;
    const periodMap = new Map<
      string,
      EmployeeAiAudit["periodBreakdown"][number]
    >();
    const getPeriod = (date: string) => {
      const period = date.slice(0, 7);
      const current = periodMap.get(period) || {
        period,
        todoDays: 0,
        plannedTodoItems: 0,
        completedTodoItems: 0,
        eodDays: 0,
        eodTasks: 0,
        eodMinutes: 0,
        activityCount: 0,
        callCount: 0,
        trackedSeconds: 0,
      };
      periodMap.set(period, current);
      return current;
    };

    formattedTodos.forEach((todo) => {
      const period = getPeriod(todo.date);
      period.todoDays += 1;
      period.plannedTodoItems += todo.items.length;
      period.completedTodoItems += todo.items.filter(
        (item: { done: boolean }) => item.done,
      ).length;
    });
    formattedEods.forEach((eod) => {
      const period = getPeriod(eod.date);
      period.eodDays += 1;
      period.eodTasks += eod.tasks.length;
      period.eodMinutes += eod.tasks.reduce(
        (total: number, task: { timeTaken: string }) =>
          total + durationToMinutes(task.timeTaken),
        0,
      );
      period.activityCount += eod.tasks.reduce(
        (total: number, task: { count?: number; callCount?: number }) =>
          total + Number(task.count || task.callCount || 0),
        0,
      );
      period.callCount += eod.tasks.reduce(
        (total: number, task: { callCount?: number }) =>
          total + Number(task.callCount || 0),
        0,
      );
    });
    employeeAnalytics.forEach((analyticsRecord) => {
      const period = getPeriod(analyticsRecord.date);
      period.trackedSeconds += Number(analyticsRecord.totalTrackedSeconds || 0);
    });
    const periodBreakdown = Array.from(periodMap.values())
      .map((period) => ({
        ...period,
        eodMinutes: Math.round(period.eodMinutes),
        trackedSeconds: Math.round(period.trackedSeconds),
      }))
      .sort((left, right) => left.period.localeCompare(right.period));
    const totalEodMinutes = eodTasks.reduce(
      (total, task) => total + durationToMinutes(task.timeTaken),
      0,
    );
    const topTask = taskWorkSummary[0];
    const summaries = {
      todo:
        plannedItems.length > 0
          ? `${completedTodoItems} of ${plannedItems.length} Todo items were marked complete across ${formattedTodos.length} submitted day(s).`
          : "No Todo items were recorded in this period.",
      eod:
        formattedEods.length > 0
          ? `${formattedEods.length} EOD report(s) contain ${eodTasks.length} task entries, ${formatMinutesLabel(totalEodMinutes)} of recorded task time, ${eodTasks.reduce((total, task) => total + Number(task.count || task.callCount || 0), 0)} counted output(s), and ${eodTasks.reduce((total, task) => total + Number(task.callCount || 0), 0)} call(s).`
          : "No EOD report was recorded in this period.",
      workload: topTask
        ? `${topTask.task} is the largest recorded task group with ${topTask.eodOccurrences} EOD occurrence(s) across ${topTask.daysWorked} day(s) and ${formatMinutesLabel(topTask.totalMinutes)} recorded.`
        : "There is not enough Todo/EOD evidence to summarize workload.",
      repetition:
        repetitiveTasks.length > 0
          ? `${repetitiveTasks.length} recurring task group(s) account for ${formatMinutesLabel(repetitiveTasks.reduce((total, task) => total + task.totalMinutes, 0))}; ${automationCandidates.length} match a rule-based automation pattern for AI review.`
          : "No repeated task group was found in this period.",
    };

    return {
      employeeId: user.employeeId,
      name: user.name,
      departmentName,
      role: user.role,
      employmentContext: {
        assignedDepartment: departmentName,
        departmentDescription,
        platformRole: user.role,
        jobTitle: null,
        contextCoverage:
          departmentName === "Unassigned"
            ? "UNASSIGNED"
            : departmentDescription
              ? "DEPARTMENT_DESCRIPTION"
              : "DEPARTMENT_NAME_ONLY",
      },
      coverage: {
        daysInRange,
        attendanceDays: employeeAttendance.length,
        presentDays,
        todoDays: formattedTodos.length,
        eodDays: formattedEods.length,
        toolTrackingDetail:
          employeeEvents.length > 0
            ? "FULL"
            : employeeAnalytics.length > 0
              ? "DAILY_SUMMARY_ONLY"
              : "NONE",
      },
      metrics: {
        plannedTodoItems: plannedItems.length,
        completedTodoItems,
        todoCompletionRate:
          plannedItems.length > 0
            ? round((completedTodoItems / plannedItems.length) * 100)
            : 0,
        eodTaskCount: eodTasks.length,
        eodActivityCount: eodTasks.reduce(
          (total, task) => total + Number(task.count || task.callCount || 0),
          0,
        ),
        eodCallCount: eodTasks.reduce(
          (total, task) => total + Number(task.callCount || 0),
          0,
        ),
        eodLoggedMinutes: eodTasks.reduce(
          (total, task) => total + durationToMinutes(task.timeTaken),
          0,
        ),
        todoEodAlignedItems: alignedItems,
        todoEodAlignmentRate:
          plannedItems.length > 0
            ? round((alignedItems / plannedItems.length) * 100)
            : 0,
        trackedSeconds: Math.round(trackedSeconds),
        productiveSeconds: Math.round(productiveSeconds),
        unproductiveSeconds: Math.round(unproductiveSeconds),
        neutralSeconds: Math.round(neutralSeconds),
        idleAndBreakSeconds: Math.round(idleAndBreakSeconds),
        focusScore:
          trackedSeconds > 0
            ? round(100 - (unproductiveSeconds / trackedSeconds) * 100)
            : 0,
        codingAgentSeconds: codingAgentList.reduce(
          (total, tool) => total + tool.seconds,
          0,
        ),
        googleSheetsSeconds: googleSheetsList.reduce(
          (total, tool) => total + tool.seconds,
          0,
        ),
        developmentToolSeconds: developmentToolList.reduce(
          (total, tool) => total + tool.seconds,
          0,
        ),
        repetitiveTaskCount: repetitiveTasks.length,
        repetitiveTaskMinutes: repetitiveTasks.reduce(
          (total, task) => total + task.totalMinutes,
          0,
        ),
        automationCandidateCount: automationCandidates.length,
        automationCandidateMinutes: automationCandidates.reduce(
          (total, task) => total + task.totalMinutes,
          0,
        ),
      },
      tools: {
        codingAgents: codingAgentList,
        googleSheets: googleSheetsList,
        developmentTools: developmentToolList,
      },
      appUsage: topApps,
      taskWorkSummary,
      summaries,
      periodBreakdown,
      todos: formattedTodos,
      eods: formattedEods,
    };
  });

  const openRouter = getOpenRouterStatus();
  const employees: EmployeeAiAudit[] = await mapWithConcurrency(
    withoutAi,
    4,
    async (employee) => {
      const evidenceFallback = buildEvidenceFallback(employee);
      if (!includeAi) {
        return {
          ...employee,
          ai: {
            ...evidenceFallback,
            status: "skipped",
            verdict: "NOT_ANALYZED",
            confidence: "LOW",
            summary: `${evidenceFallback.summary} AI enhancement was not requested.`,
          },
        };
      }

      if (!openRouter.configured) {
        return {
          ...employee,
          ai: {
            ...evidenceFallback,
            status: "unavailable",
            verdict: "NOT_ANALYZED",
            confidence: "LOW",
            summary: `${evidenceFallback.summary} AI enhancement is unavailable until OPENROUTER_API_KEY is configured.`,
            error: "OPENROUTER_API_KEY is not configured.",
          },
        };
      }

      try {
        return { ...employee, ai: await analyzeEmployee(employee) };
      } catch (error) {
        return {
          ...employee,
          ai: {
            ...evidenceFallback,
            status: "failed",
            verdict: "NOT_ANALYZED",
            confidence: "LOW",
            summary: `${evidenceFallback.summary} The evidence-based fallback is shown because the external AI enhancement could not complete.`,
            error:
              error instanceof Error ? error.message : "AI request failed.",
          },
        };
      }
    },
  );

  const completedEmployees = employees.filter(
    (employee) => employee.ai.status === "completed",
  ).length;
  const failedEmployees = employees.filter(
    (employee) => employee.ai.status === "failed",
  ).length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dateRange: { startDate, endDate },
    ai: {
      configured: openRouter.configured,
      requested: includeAi,
      model: openRouter.model,
      completedEmployees,
      failedEmployees,
      note: !openRouter.configured
        ? "Add OPENROUTER_API_KEY to the backend environment and optionally set OPENROUTER_MODEL."
        : undefined,
    },
    summary: {
      employeeCount: employees.length,
      looksGoodCount: employees.filter(
        (employee) => employee.ai.verdict === "LOOKS_GOOD",
      ).length,
      needsReviewCount: employees.filter(
        (employee) => employee.ai.verdict === "NEEDS_REVIEW",
      ).length,
      insufficientDataCount: employees.filter(
        (employee) => employee.ai.verdict === "INSUFFICIENT_DATA",
      ).length,
      notAnalyzedCount: employees.filter(
        (employee) => employee.ai.verdict === "NOT_ANALYZED",
      ).length,
      totalTrackedSeconds: employees.reduce(
        (total, employee) => total + employee.metrics.trackedSeconds,
        0,
      ),
      codingAgentSeconds: employees.reduce(
        (total, employee) => total + employee.metrics.codingAgentSeconds,
        0,
      ),
      googleSheetsSeconds: employees.reduce(
        (total, employee) => total + employee.metrics.googleSheetsSeconds,
        0,
      ),
      repetitiveTaskCount: employees.reduce(
        (total, employee) => total + employee.metrics.repetitiveTaskCount,
        0,
      ),
      repetitiveTaskMinutes: employees.reduce(
        (total, employee) => total + employee.metrics.repetitiveTaskMinutes,
        0,
      ),
      automationCandidateCount: employees.reduce(
        (total, employee) => total + employee.metrics.automationCandidateCount,
        0,
      ),
      aiAutomationOpportunityCount: employees.reduce(
        (total, employee) => total + employee.ai.automationOpportunities.length,
        0,
      ),
    },
    employees,
  };
};
