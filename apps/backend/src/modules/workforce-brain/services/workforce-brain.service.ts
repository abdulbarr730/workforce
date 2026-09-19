import { AssignedTask } from "../../assigned-tasks/model/assigned-task.model";
import { DailyTodo } from "../../daily-flow/model/daily-todo.model";
import { EodReport } from "../../daily-flow/model/eod-report.model";
import { Department } from "../../departments/model/department.model";
import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { User } from "../../users/model/user.model";
import {
  extractClaudeJsonObject,
  getClaudeStatus,
  requestClaudeJson,
} from "../../../shared/services/claude.service";
import { WorkforceBrainMemory } from "../model/workforce-brain-memory.model";

type TrainBrainOptions = {
  employeeId?: string;
  departmentId?: string;
  days?: number;
  includeClaude?: boolean;
};

type BrainMemoryDraft = {
  scope: "COMPANY" | "DEPARTMENT" | "EMPLOYEE";
  key: string;
  label: string;
  employeeId?: string;
  employeeName?: string;
  departmentId?: string;
  departmentName?: string;
  summary: string;
  operatingStyle: string[];
  commonTasks: string[];
  commonApplications: string[];
  eodWritingStyle: string[];
  checkinStyle: string[];
  assignedTaskPatterns: string[];
  promptInstructions: string[];
  examples: Array<{
    date: string;
    task: string;
    interval: string;
    duration: string;
    evidence: string;
  }>;
  stats: Record<string, unknown>;
  sourceWindow: { startDate: string; endDate: string; days: number };
  generatedBy: string;
  model: string;
  confidence: number;
};

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const addCount = (map: Map<string, number>, value: unknown, weight = 1) => {
  const key = String(value || "").trim();
  if (!key) return;
  map.set(key, (map.get(key) || 0) + weight);
};

const topEntries = (map: Map<string, number>, limit = 12) =>
  Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));

const topLabels = (map: Map<string, number>, limit = 12) =>
  topEntries(map, limit).map((entry) => entry.label);

const appLabel = (event: any) => {
  const metadata = event?.metadata || {};
  const app = String(metadata.app || "").trim();
  const title = String(metadata.title || "").trim();
  const domain = String(metadata.domain || "").trim();
  if (/teams/i.test(app) || /microsoft teams/i.test(title))
    return "Microsoft Teams";
  if (domain) return domain;
  if (app) return app;
  return title || "Unknown app";
};

const normalizeStringArray = (value: unknown, fallback: string[] = []) =>
  Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 20)
    : fallback;

const normalizeExamples = (
  value: unknown,
  fallback: BrainMemoryDraft["examples"] = [],
) =>
  Array.isArray(value)
    ? value
        .map((item: any) => ({
          date: String(item?.date || "").trim(),
          task: String(item?.task || "").trim(),
          interval: String(item?.interval || "").trim(),
          duration: String(item?.duration || "").trim(),
          evidence: String(item?.evidence || "").trim(),
        }))
        .filter((item) => item.task)
        .slice(0, 12)
    : fallback;

const summarizeWithClaude = async (draft: BrainMemoryDraft) => {
  const status = getClaudeStatus();
  if (!status.configured) return draft;

  const result = await requestClaudeJson({
    system:
      "You are building a reusable company operations memory for an internal workforce system. Convert raw evidence into compact, durable memory. Do not invent facts. Do not include private personal judgments. Return JSON only.",
    messages: [
      {
        role: "user",
        content: `Create a reusable brain memory from this draft. Keep it concise and operational. This memory will be reused for EOD and 2-hour check-in autofill.

Return exactly:
{
  "summary": "5-8 sentence operational memory",
  "operatingStyle": ["how this scope normally works"],
  "commonTasks": ["recurring task categories or exact task names"],
  "commonApplications": ["apps/domains commonly used"],
  "eodWritingStyle": ["how EODs are usually phrased"],
  "checkinStyle": ["how 2-hour check-ins should be filled"],
  "assignedTaskPatterns": ["how assigned tasks usually flow"],
  "promptInstructions": ["instructions future AI calls must follow"],
  "examples": [{"date":"YYYY-MM-DD","task":"task","interval":"time interval","duration":"duration","evidence":"source evidence"}],
  "confidence": 0.0
}

Draft:
${JSON.stringify(draft)}`,
      },
    ],
    maxTokens: 1_800,
    temperature: 0.1,
  });

  const parsed = extractClaudeJsonObject(result.content) as any;
  return {
    ...draft,
    summary: String(parsed?.summary || draft.summary).trim(),
    operatingStyle: normalizeStringArray(
      parsed?.operatingStyle,
      draft.operatingStyle,
    ),
    commonTasks: normalizeStringArray(parsed?.commonTasks, draft.commonTasks),
    commonApplications: normalizeStringArray(
      parsed?.commonApplications,
      draft.commonApplications,
    ),
    eodWritingStyle: normalizeStringArray(
      parsed?.eodWritingStyle,
      draft.eodWritingStyle,
    ),
    checkinStyle: normalizeStringArray(
      parsed?.checkinStyle,
      draft.checkinStyle,
    ),
    assignedTaskPatterns: normalizeStringArray(
      parsed?.assignedTaskPatterns,
      draft.assignedTaskPatterns,
    ),
    promptInstructions: normalizeStringArray(
      parsed?.promptInstructions,
      draft.promptInstructions,
    ),
    examples: normalizeExamples(parsed?.examples, draft.examples),
    generatedBy: "CLAUDE_WORKFORCE_BRAIN_TRAINER",
    model: result.model,
    confidence: Math.max(
      0.35,
      Math.min(0.98, Number(parsed?.confidence) || 0.75),
    ),
  };
};

const buildDraft = ({
  scope,
  key,
  label,
  users,
  eods,
  todos,
  assignedTasks,
  events,
  sourceWindow,
  employeeId = "",
  employeeName = "",
  departmentId = "",
  departmentName = "",
}: {
  scope: BrainMemoryDraft["scope"];
  key: string;
  label: string;
  users: any[];
  eods: any[];
  todos: any[];
  assignedTasks: any[];
  events: any[];
  sourceWindow: BrainMemoryDraft["sourceWindow"];
  employeeId?: string;
  employeeName?: string;
  departmentId?: string;
  departmentName?: string;
}): BrainMemoryDraft => {
  const taskCounts = new Map<string, number>();
  const appCounts = new Map<string, number>();
  const intervalCounts = new Map<string, number>();
  const todoCounts = new Map<string, number>();
  const assignedCounts = new Map<string, number>();
  const examples: BrainMemoryDraft["examples"] = [];

  eods.forEach((report) => {
    (report.tasksWithTimings || []).forEach((task: any) => {
      addCount(taskCounts, task.text, task.isTopTask ? 3 : 2);
      addCount(intervalCounts, task.interval);
      if (examples.length < 12 && task.text) {
        examples.push({
          date: String(report.date || ""),
          task: String(task.text || ""),
          interval: String(task.interval || ""),
          duration: String(task.timeTaken || ""),
          evidence: "EOD task timing",
        });
      }
    });
    (report.completedItems || []).forEach((item: string) =>
      addCount(taskCounts, item),
    );
    (report.top3Tasks || []).forEach((item: string) =>
      addCount(taskCounts, item, 2),
    );
  });

  todos.forEach((todo) => {
    (todo.items || []).forEach((item: any) => {
      addCount(todoCounts, item.text, item.done ? 2 : 1);
      if (item.done) addCount(taskCounts, item.text, 1.5);
    });
    (todo.checkins || []).forEach((checkin: any) => {
      addCount(intervalCounts, checkin.interval);
      (checkin.tasks || []).forEach((task: any) => {
        addCount(taskCounts, task.text, 2);
        if (examples.length < 12 && task.text) {
          examples.push({
            date: String(todo.date || ""),
            task: String(task.text || ""),
            interval: String(checkin.interval || task.interval || ""),
            duration: String(task.timeTaken || ""),
            evidence: "2-hour check-in",
          });
        }
      });
    });
  });

  assignedTasks.forEach((task) => {
    addCount(assignedCounts, task.title, task.status === "COMPLETED" ? 3 : 1);
    addCount(taskCounts, task.title, task.status === "COMPLETED" ? 2 : 1);
  });

  events.forEach((event) => addCount(appCounts, appLabel(event)));

  const commonTasks = topLabels(taskCounts, 16);
  const commonApplications = topLabels(appCounts, 14);
  const assignedPatterns = topLabels(assignedCounts, 10).map(
    (task) => `Assigned-task pattern: ${task}`,
  );
  const intervalPatterns = topLabels(intervalCounts, 8);
  const todoPatterns = topLabels(todoCounts, 10);
  const employeeCount = users.length;

  return {
    scope,
    key,
    label,
    employeeId,
    employeeName,
    departmentId,
    departmentName,
    summary: `${label} memory trained from ${eods.length} EOD reports, ${todos.length} Todo records, ${assignedTasks.length} assigned tasks, and ${events.length} telemetry events across ${employeeCount || 1} employee${employeeCount === 1 ? "" : "s"}. Common work includes: ${commonTasks.slice(0, 8).join(", ") || "not enough history yet"}. Common apps/domains include: ${commonApplications.slice(0, 6).join(", ") || "not enough telemetry yet"}.`,
    operatingStyle: [
      employeeCount > 1
        ? `Use this as shared ${scope.toLowerCase()} context, not as proof for one employee.`
        : "Use this employee's own history first when suggesting work.",
      intervalPatterns.length
        ? `Observed intervals: ${intervalPatterns.join(", ")}`
        : "No stable interval pattern yet.",
    ],
    commonTasks,
    commonApplications,
    eodWritingStyle: [
      "Prefer exact task names that already appeared in EOD, Todo, assigned tasks, or telemetry evidence.",
      "Use durations from submitted check-ins/EOD when present; otherwise estimate conservatively.",
    ],
    checkinStyle: [
      "For 2-hour check-ins, only suggest tasks with evidence inside or near the requested interval.",
      "Keep rows editable and do not submit automatically.",
    ],
    assignedTaskPatterns: assignedPatterns,
    promptInstructions: [
      "Never invent work without evidence.",
      "Employee memory beats department memory; department memory beats company memory.",
      "For new employees, use department/company memory only as fallback and lower confidence.",
      "Use Todo and assigned tasks as strong intent signals.",
      "Use telemetry apps/domains as supporting evidence, not the only truth.",
    ],
    examples,
    stats: {
      employeeCount,
      eodReports: eods.length,
      todoRecords: todos.length,
      assignedTasks: assignedTasks.length,
      telemetryEvents: events.length,
      topTasks: topEntries(taskCounts, 20),
      topTodos: topEntries(todoCounts, 12),
      topApplications: topEntries(appCounts, 16),
      topIntervals: topEntries(intervalCounts, 10),
    },
    sourceWindow,
    generatedBy: "LOCAL_WORKFORCE_BRAIN_TRAINER",
    model: "local-statistical-memory",
    confidence: Math.min(
      0.92,
      0.35 +
        Math.min(eods.length, 20) * 0.015 +
        Math.min(todos.length, 20) * 0.01 +
        Math.min(events.length, 500) * 0.0003,
    ),
  };
};

const saveMemory = async (memory: BrainMemoryDraft) => {
  let deptResponsibilities: string[] = [];
  if (memory.departmentId) {
    const dept = await Department.findById(memory.departmentId).lean();
    if (dept?.responsibilities) {
      deptResponsibilities = dept.responsibilities;
    }
  }

  const nextRevisionDueAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  return WorkforceBrainMemory.findOneAndUpdate(
    { scope: memory.scope, key: memory.key },
    {
      $set: {
        ...memory,
        departmentResponsibilities: deptResponsibilities,
        lastTrainedAt: new Date(),
        nextRevisionDueAt,
        revisionCycleDays: 15,
        version: 1,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean();
};

export const trainWorkforceBrain = async ({
  employeeId,
  departmentId,
  days = 60,
  includeClaude = true,
}: TrainBrainOptions = {}) => {
  const safeDays = Math.max(7, Math.min(365, Number(days) || 60));
  const endDate = toDateKey(new Date());
  const startDate = toDateKey(
    new Date(Date.now() - (safeDays - 1) * 24 * 60 * 60 * 1000),
  );
  const sourceWindow = { startDate, endDate, days: safeDays };

  const userFilter: Record<string, unknown> = {
    role: { $nin: ["SUPER_ADMIN", "ADMIN"] },
    deletedAt: null,
  };
  if (employeeId) userFilter.employeeId = employeeId;
  if (departmentId) {
    userFilter.$or = [{ departmentId }, { departmentIds: departmentId }];
  }

  const users = await User.find(userFilter)
    .select(
      "employeeId name departmentId departmentName departmentIds departmentNames",
    )
    .lean();
  const employeeIds = users.map((user) => user.employeeId);
  if (!employeeIds.length) {
    return {
      trained: [],
      sourceWindow,
      claude: getClaudeStatus(),
      message: "No matching employees found for brain training.",
    };
  }

  const [departments, eods, todos, assignedTasks, events] = await Promise.all([
    Department.find({ isActive: true }).lean(),
    EodReport.find({
      employeeId: { $in: employeeIds },
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: -1 })
      .lean(),
    DailyTodo.find({
      employeeId: { $in: employeeIds },
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: -1 })
      .lean(),
    AssignedTask.find({
      assignedToEmployeeId: { $in: employeeIds },
      scheduledFor: { $gte: startDate, $lte: endDate },
    })
      .sort({ scheduledFor: -1 })
      .lean(),
    ActivityEvent.find({
      employeeId: { $in: employeeIds },
      timestamp: {
        $gte: new Date(`${startDate}T00:00:00.000+05:30`),
        $lte: new Date(`${endDate}T23:59:59.999+05:30`),
      },
      invalidated: { $ne: true },
      type: "ACTIVE_WINDOW" as any,
    })
      .sort({ timestamp: -1 })
      .limit(12_000)
      .lean(),
  ]);

  const memories: BrainMemoryDraft[] = [];
  const companyDraft = buildDraft({
    scope: "COMPANY",
    key: "company",
    label: "Company Brain",
    users,
    eods,
    todos,
    assignedTasks,
    events,
    sourceWindow,
  });
  memories.push(companyDraft);

  const departmentKeys = new Map<
    string,
    { id: string; name: string; users: any[] }
  >();
  users.forEach((user: any) => {
    const ids = [
      String(user.departmentId || ""),
      ...(Array.isArray(user.departmentIds)
        ? user.departmentIds.map(String)
        : []),
    ].filter(Boolean);
    const names = [
      String(user.departmentName || ""),
      ...(Array.isArray(user.departmentNames)
        ? user.departmentNames.map(String)
        : []),
    ].filter(Boolean);
    ids.forEach((id, index) => {
      const department = departments.find(
        (dept: any) => String(dept._id) === id,
      );
      const name =
        department?.name || names[index] || user.departmentName || id;
      const existing = departmentKeys.get(id) || {
        id,
        name,
        users: [] as any[],
      };
      existing.users.push(user);
      departmentKeys.set(id, existing);
    });
  });

  departmentKeys.forEach((department) => {
    const ids = new Set(department.users.map((user) => user.employeeId));
    memories.push(
      buildDraft({
        scope: "DEPARTMENT",
        key: department.id,
        label: `${department.name} Department Brain`,
        departmentId: department.id,
        departmentName: department.name,
        users: department.users,
        eods: eods.filter((report: any) => ids.has(report.employeeId)),
        todos: todos.filter((todo: any) => ids.has(todo.employeeId)),
        assignedTasks: assignedTasks.filter((task: any) =>
          ids.has(task.assignedToEmployeeId),
        ),
        events: events.filter((event: any) => ids.has(event.employeeId)),
        sourceWindow,
      }),
    );
  });

  users.forEach((user: any) => {
    memories.push(
      buildDraft({
        scope: "EMPLOYEE",
        key: user.employeeId,
        label: `${user.name} Employee Brain`,
        employeeId: user.employeeId,
        employeeName: user.name,
        departmentId: String(user.departmentId || ""),
        departmentName: String(user.departmentName || ""),
        users: [user],
        eods: eods.filter(
          (report: any) => report.employeeId === user.employeeId,
        ),
        todos: todos.filter((todo: any) => todo.employeeId === user.employeeId),
        assignedTasks: assignedTasks.filter(
          (task: any) => task.assignedToEmployeeId === user.employeeId,
        ),
        events: events.filter(
          (event: any) => event.employeeId === user.employeeId,
        ),
        sourceWindow,
      }),
    );
  });

  const trained = [];
  for (const draft of memories) {
    let memory = draft;
    if (includeClaude) {
      try {
        memory = await summarizeWithClaude(draft);
      } catch (error) {
        memory = {
          ...draft,
          generatedBy: "LOCAL_WORKFORCE_BRAIN_TRAINER",
          model: "local-statistical-memory",
          promptInstructions: [
            ...draft.promptInstructions,
            `Claude training failed; local memory used. ${error instanceof Error ? error.message : ""}`.trim(),
          ],
        };
      }
    }
    trained.push(await saveMemory(memory));
  }

  return {
    trained,
    sourceWindow,
    claude: getClaudeStatus(),
    message: `Trained ${trained.length} brain memories.`,
  };
};

const formatMemoryForPrompt = (memory: any) => {
  if (!memory) return "";
  return [
    `### ${memory.label}`,
    `Scope: ${memory.scope}`,
    memory.summary ? `Summary: ${memory.summary}` : "",
    memory.commonTasks?.length
      ? `Common tasks: ${memory.commonTasks.slice(0, 12).join("; ")}`
      : "",
    memory.commonApplications?.length
      ? `Common apps/domains: ${memory.commonApplications.slice(0, 10).join("; ")}`
      : "",
    memory.eodWritingStyle?.length
      ? `EOD style: ${memory.eodWritingStyle.join("; ")}`
      : "",
    memory.checkinStyle?.length
      ? `Check-in style: ${memory.checkinStyle.join("; ")}`
      : "",
    memory.assignedTaskPatterns?.length
      ? `Assigned task patterns: ${memory.assignedTaskPatterns.join("; ")}`
      : "",
    memory.promptInstructions?.length
      ? `Instructions: ${memory.promptInstructions.join("; ")}`
      : "",
    memory.examples?.length
      ? `Examples: ${memory.examples
          .slice(0, 6)
          .map(
            (example: any) =>
              `${example.date} | ${example.interval} | ${example.task} | ${example.duration} | ${example.evidence}`,
          )
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export const getWorkforceBrainContext = async (employeeId: string) => {
  const user = await User.findOne({ employeeId })
    .select(
      "employeeId name departmentId departmentName departmentIds departmentNames",
    )
    .lean();
  const departmentIds = [
    String((user as any)?.departmentId || ""),
    ...(((user as any)?.departmentIds || []) as string[]).map(String),
  ].filter(Boolean);

  const [company, employee, departments] = await Promise.all([
    WorkforceBrainMemory.findOne({ scope: "COMPANY", key: "company" }).lean(),
    WorkforceBrainMemory.findOne({ scope: "EMPLOYEE", key: employeeId }).lean(),
    WorkforceBrainMemory.find({
      scope: "DEPARTMENT",
      key: { $in: departmentIds },
    }).lean(),
  ]);

  const memories = [company, ...departments, employee].filter(Boolean);
  return {
    user,
    memories,
    prompt: memories.map(formatMemoryForPrompt).filter(Boolean).join("\n\n"),
    freshness: memories.map((memory: any) => ({
      scope: memory.scope,
      key: memory.key,
      label: memory.label,
      lastTrainedAt: memory.lastTrainedAt,
      generatedBy: memory.generatedBy,
      model: memory.model,
      confidence: memory.confidence,
    })),
  };
};

export const getWorkforceBrainStatus = async (employeeId?: string) => {
  const filter: Record<string, any> = employeeId
    ? { $or: [{ scope: "COMPANY" }, { employeeId }, { key: employeeId }] }
    : {};
  const memories = await WorkforceBrainMemory.find(filter)
    .sort({ scope: 1, label: 1 })
    .select(
      "scope key label employeeId employeeName departmentId departmentName generatedBy model confidence lastTrainedAt nextRevisionDueAt revisionCycleDays sourceWindow stats departmentResponsibilities",
    )
    .lean();
  return {
    claude: getClaudeStatus(),
    count: memories.length,
    memories,
  };
};

export const checkAndRunPeriodicMemoryRevision = async () => {
  const now = new Date();
  const dueMemories = await WorkforceBrainMemory.find({
    $or: [
      { nextRevisionDueAt: { $lte: now } },
      { lastTrainedAt: { $lte: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000) } },
    ],
  }).lean();

  if (!dueMemories.length) {
    return {
      revised: 0,
      message: "All Workforce Brain memories are up to date within the 15-day window.",
    };
  }

  const result = await trainWorkforceBrain({ days: 60, includeClaude: true });
  return {
    revised: result.trained.length,
    message: `Revised ${result.trained.length} memories due for 15-day update.`,
  };
};
