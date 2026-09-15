import { ActivityEvent } from "../../tracking/model/activity-event.model";
import { DailyTodo } from "../model/daily-todo.model";
import { EodReport } from "../model/eod-report.model";
import { AssignedTask } from "../../assigned-tasks/model/assigned-task.model";
import { getBusinessDayBounds } from "../../attendance/services/shift-schedule.service";
import {
  extractClaudeJsonObject,
  getClaudeStatus,
  requestClaudeJson,
} from "../../../shared/services/claude.service";

type SuggestedRow = {
  task: string;
  interval: string;
  hours: string;
  count?: number;
  isTopTask?: boolean;
  confidence: number;
  source: string;
  evidence: string[];
  decision?: {
    engine: string;
    brain?: string;
    predictedTask: string;
    confidence: number;
    alternatives: Array<{ task: string; score: number }>;
    features: string[];
  };
};

type TaskProfile = {
  key: string;
  label: string;
  occurrences: number;
  recencyWeight: number;
  totalMinutes: number;
  topTaskCount: number;
  tokenWeights: Map<string, number>;
  intervalHourWeights: Map<number, number>;
};

type DecisionModel = {
  scope: "EMPLOYEE" | "TEAM";
  trainedExamples: number;
  profiles: TaskProfile[];
  vocabulary: Set<string>;
};

type BuildEodSuggestionOptions = {
  includeAi?: boolean;
};

const normalizeTask = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "work",
  "task",
  "done",
  "completed",
  "update",
  "updates",
  "follow",
  "followup",
  "followups",
]);

const tokenize = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

const addWeightedTokens = (
  target: Map<string, number>,
  value: string,
  weight: number,
) => {
  tokenize(value).forEach((token) =>
    target.set(token, (target.get(token) || 0) + weight),
  );
};

const parseDurationMinutes = (value: unknown) => {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  if (!raw) return 0;
  if (raw.includes(":")) {
    const [hours, minutes] = raw.split(":");
    return (
      (Number.parseInt(hours || "0", 10) || 0) * 60 +
      (Number.parseInt(minutes || "0", 10) || 0)
    );
  }
  const hoursMatch = raw.match(/([\d.]+)\s*h/);
  const minutesMatch = raw.match(/([\d.]+)\s*m/);
  if (hoursMatch || minutesMatch) {
    return Math.round(
      (hoursMatch ? Number.parseFloat(hoursMatch[1]) * 60 : 0) +
        (minutesMatch ? Number.parseFloat(minutesMatch[1]) : 0),
    );
  }
  const decimalHours = Number.parseFloat(raw);
  return Number.isFinite(decimalHours) ? Math.round(decimalHours * 60) : 0;
};

const formatMinutes = (minutes: number) => {
  const safe = Math.max(1, Math.round(minutes));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60,
  ).padStart(2, "0")}`;
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

const intervalLabel = (start: Date, end: Date) =>
  `${formatTime(start)} – ${formatTime(end)}`;

const intervalStartHour = (interval: string) => {
  const match = String(interval || "").match(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i,
  );
  if (!match) return null;
  let hour = Number(match[1]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return Number.isFinite(hour) ? hour : null;
};

const appLabel = (metadata: any) => {
  const app = String(metadata?.app || "").trim();
  const title = String(metadata?.title || "").trim();
  const domain = String(metadata?.domain || "").trim();
  if (/teams/i.test(app) || /microsoft teams/i.test(title)) {
    return "Microsoft Teams communication and task updates";
  }
  if (/chrome|edge|browser/i.test(app) && domain) {
    if (/docs\.google|sheets/i.test(domain) || /google sheets/i.test(title)) {
      return "Google Sheets / data work";
    }
    if (/mail\.google|gmail/i.test(domain) || /gmail/i.test(title)) {
      return "Email follow-ups and responses";
    }
    if (/prosunc|prosync|crm|dashboard/i.test(domain + " " + title)) {
      return "CRM / dashboard work";
    }
    return `Browser work on ${domain}`;
  }
  if (app) return `${app} work`;
  if (title) return title.slice(0, 80);
  return "Work activity";
};

const eventDurationSeconds = (event: any) => {
  const metadata = event.metadata || {};
  const raw =
    metadata.durationSeconds ??
    metadata.idleSeconds ??
    (metadata.idleMinutes ? Number(metadata.idleMinutes) * 60 : undefined);
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 30;
};

const pushUnique = (rows: SuggestedRow[], row: SuggestedRow) => {
  const key = `${normalizeTask(row.task)}|${row.interval}`;
  if (
    rows.some(
      (existing) =>
        `${normalizeTask(existing.task)}|${existing.interval}` === key,
    )
  ) {
    return;
  }
  rows.push(row);
};

const normalizeAiRows = (value: unknown, modelName: string): SuggestedRow[] => {
  const rawRows = Array.isArray((value as any)?.rows)
    ? (value as any).rows
    : [];
  return rawRows
    .map((row: any) => {
      const task = String(row?.task || "").trim();
      const interval = String(row?.interval || "").trim();
      const hours = String(row?.hours || "").trim();
      if (!task || !hours) return null;
      const confidence = Math.max(
        0.35,
        Math.min(0.98, Number(row?.confidence) || 0.65),
      );
      return {
        task,
        interval,
        hours,
        count:
          Number.isInteger(Number(row?.count)) && Number(row.count) > 0
            ? Number(row.count)
            : undefined,
        isTopTask: Boolean(row?.isTopTask),
        confidence,
        source: "CLAUDE_EMPLOYEE_DECISION_ENGINE",
        evidence: Array.isArray(row?.evidence)
          ? row.evidence.map((item: unknown) => String(item)).filter(Boolean)
          : [],
        decision: {
          engine: "CLAUDE_EOD_EMPLOYEE_ENGINE_V1",
          brain: modelName,
          predictedTask: task,
          confidence: Number(confidence.toFixed(3)),
          alternatives: [],
          features: [String(row?.decisionReason || "").trim()].filter(Boolean),
        },
      } satisfies SuggestedRow;
    })
    .filter(Boolean) as SuggestedRow[];
};

const enhanceWithClaude = async ({
  employeeId,
  date,
  rows,
  model,
  telemetrySummary,
  todo,
  assignedTasks,
}: {
  employeeId: string;
  date: string;
  rows: SuggestedRow[];
  model: {
    employeeTrainingExamples: number;
    teamTrainingExamples: number;
    learnedEmployeeTasks: number;
    learnedTeamTasks: number;
  };
  telemetrySummary: Array<{
    interval: string;
    totalMinutes: number;
    topSignals: string[];
  }>;
  todo: any;
  assignedTasks: any[];
}) => {
  const status = getClaudeStatus();
  if (!status.configured) {
    return {
      rows,
      ai: {
        used: false,
        brain: "LOCAL_EMPLOYEE_MODEL_ONLY",
        reason: "ANTHROPIC_API_KEY is not configured",
      },
    };
  }

  const response = await requestClaudeJson({
    system:
      'You are the direct Claude EOD auto-fill decision brain for a workforce tracking system. You decide suggested EOD rows only from supplied operational evidence. Each employee must be treated independently; never use identity, personality, or HR judgments. Prefer the employee\'s own learned history. Use department/team knowledge only as fallback for new employees or weak employee history. Do not submit EOD. Return reviewable draft rows only. Return JSON only, with this shape: {"rows":[{"task":"string","interval":"string","hours":"HH:MM","count":number|null,"isTopTask":boolean,"confidence":number,"source":"string","evidence":["string"],"decisionReason":"string"}],"notes":"string"}.',
    messages: [
      {
        role: "user",
        content: `Build an EOD draft for exactly one employee and one date. Use the local employee model as evidence, but you may correct it when telemetry/Todo/assigned-task evidence points elsewhere. Prefer the employee's own history over team history. Use 2-hour-ish intervals. Do not invent work that has no evidence. If evidence is weak, use lower confidence.

Employee model context:
${JSON.stringify({ employeeId, date, model })}

Current completed Todo/check-in evidence:
${JSON.stringify({
  todoItems: (todo?.items || []).map((item: any) => ({
    text: item.text,
    done: item.done,
    completedAt: item.completedAt,
    estimatedTime: item.estimatedTime,
    timeTaken: item.timeTaken,
  })),
  checkins: todo?.checkins || [],
})}

Assigned task evidence:
${JSON.stringify(
  assignedTasks.map((task: any) => ({
    title: task.title,
    status: task.status,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    estimatedTime: task.estimatedTime,
    actualTime: task.actualTime,
  })),
)}

Telemetry interval summary:
${JSON.stringify(telemetrySummary)}

Local model draft rows:
${JSON.stringify(
  rows.map((row) => ({
    task: row.task,
    interval: row.interval,
    hours: row.hours,
    confidence: row.confidence,
    source: row.source,
    evidence: row.evidence,
    decision: row.decision,
  })),
)}`,
      },
    ],
    maxTokens: 2_000,
    temperature: 0.1,
  });

  const parsed = extractClaudeJsonObject(response.content);
  const aiRows = normalizeAiRows(parsed, response.model);
  if (!aiRows.length) {
    return {
      rows,
      ai: {
        used: false,
        brain: response.model,
        reason: "Claude returned no usable rows; used local employee model",
      },
    };
  }
  return {
    rows: aiRows,
    ai: {
      used: true,
      brain: response.model,
      reason: "Claude refined the per-employee model decision",
      notes: String((parsed as any)?.notes || ""),
    },
  };
};

const taskLabelFromCompletedItem = (value: string) =>
  String(value || "")
    .replace(/\s*\([^)]*\)\s*-\s*.*$/, "")
    .replace(/\s*-\s*\d.*$/, "")
    .trim();

const createModel = (
  reports: any[],
  scope: "EMPLOYEE" | "TEAM",
): DecisionModel => {
  const profilesByKey = new Map<string, TaskProfile>();
  const vocabulary = new Set<string>();
  let trainedExamples = 0;

  reports.forEach((report, reportIndex) => {
    const recencyWeight = Math.max(0.25, 1 - reportIndex * 0.025);
    const rows =
      report.tasksWithTimings?.length > 0
        ? report.tasksWithTimings
        : (report.completedItems || []).map((item: string) => ({
            text: taskLabelFromCompletedItem(item),
            interval: "",
            timeTaken: "",
            isTopTask: false,
          }));

    rows.forEach((row: any) => {
      const label = String(row.text || "").trim();
      if (!label) return;
      const key = normalizeTask(label);
      const profile =
        profilesByKey.get(key) ||
        ({
          key,
          label,
          occurrences: 0,
          recencyWeight: 0,
          totalMinutes: 0,
          topTaskCount: 0,
          tokenWeights: new Map<string, number>(),
          intervalHourWeights: new Map<number, number>(),
        } as TaskProfile);

      const minutes = parseDurationMinutes(row.timeTaken);
      profile.occurrences += 1;
      profile.recencyWeight += recencyWeight;
      profile.totalMinutes += minutes || 60;
      profile.topTaskCount += row.isTopTask ? 1 : 0;
      addWeightedTokens(profile.tokenWeights, label, 2.5 * recencyWeight);
      addWeightedTokens(
        profile.tokenWeights,
        row.interval || "",
        0.5 * recencyWeight,
      );
      const hour = intervalStartHour(row.interval || "");
      if (hour !== null) {
        profile.intervalHourWeights.set(
          hour,
          (profile.intervalHourWeights.get(hour) || 0) + recencyWeight,
        );
      }
      profilesByKey.set(key, profile);
      tokenize(label).forEach((token) => vocabulary.add(token));
      trainedExamples += 1;
    });
  });

  return {
    scope,
    trainedExamples,
    profiles: Array.from(profilesByKey.values()).sort(
      (a, b) => b.recencyWeight - a.recencyWeight,
    ),
    vocabulary,
  };
};

const weightedTokenSimilarity = (
  features: string[],
  weights: Map<string, number>,
) => {
  if (!features.length || weights.size === 0) return 0;
  const featureSet = new Set(features);
  let matched = 0;
  let total = 0;
  weights.forEach((weight, token) => {
    total += weight;
    if (featureSet.has(token)) matched += weight;
  });
  return total > 0 ? matched / total : 0;
};

const hourAffinity = (hour: number | null, profile: TaskProfile) => {
  if (hour === null || profile.intervalHourWeights.size === 0) return 0.35;
  let best = 0;
  profile.intervalHourWeights.forEach((weight, seenHour) => {
    const distance = Math.min(6, Math.abs(seenHour - hour));
    best = Math.max(best, weight * (1 - distance / 6));
  });
  const total = Array.from(profile.intervalHourWeights.values()).reduce(
    (sum, value) => sum + value,
    0,
  );
  return total > 0 ? Math.min(1, best / total) : 0.35;
};

const chooseFromModel = (
  model: DecisionModel,
  features: string[],
  interval: string,
  fallbackLabel: string,
) => {
  const hour = intervalStartHour(interval);
  const scored = model.profiles
    .map((profile) => {
      const tokenScore = weightedTokenSimilarity(
        features,
        profile.tokenWeights,
      );
      const timeScore = hourAffinity(hour, profile);
      const priorScore = Math.min(1, profile.recencyWeight / 6);
      const score =
        tokenScore * 0.52 +
        timeScore * 0.18 +
        priorScore * 0.2 +
        Math.min(1, profile.occurrences / 8) * 0.1;
      return { profile, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.18) {
    return {
      task: fallbackLabel,
      confidence: 0.46,
      source: "TELEMETRY",
      alternatives: scored.slice(0, 3).map((entry) => ({
        task: entry.profile.label,
        score: Number(entry.score.toFixed(3)),
      })),
      estimatedMinutes: 60,
      isTopTask: false,
    };
  }

  const confidence = Math.max(
    0.5,
    Math.min(
      0.94,
      0.42 + best.score * 0.55 + (model.scope === "EMPLOYEE" ? 0.07 : 0),
    ),
  );
  const estimatedMinutes = Math.round(
    best.profile.totalMinutes / Math.max(1, best.profile.occurrences),
  );
  return {
    task: best.profile.label,
    confidence,
    source: model.scope === "EMPLOYEE" ? "ML_EMPLOYEE_MODEL" : "ML_TEAM_MODEL",
    alternatives: scored.slice(0, 4).map((entry) => ({
      task: entry.profile.label,
      score: Number(entry.score.toFixed(3)),
    })),
    estimatedMinutes,
    isTopTask:
      best.profile.topTaskCount / Math.max(1, best.profile.occurrences) >= 0.35,
  };
};

const makeMlDecision = (
  employeeModel: DecisionModel,
  teamModel: DecisionModel,
  interval: string,
  topLabels: Array<[string, number]>,
) => {
  const featureText = topLabels.map(([label]) => label).join(" ");
  const features = tokenize(featureText);
  const fallbackLabel = topLabels[0]?.[0] || "Work activity";
  const employeeDecision = chooseFromModel(
    employeeModel,
    features,
    interval,
    fallbackLabel,
  );
  if (
    employeeDecision.source === "ML_EMPLOYEE_MODEL" &&
    employeeDecision.confidence >= 0.58
  ) {
    return { ...employeeDecision, features };
  }
  const teamDecision = chooseFromModel(
    teamModel,
    features,
    interval,
    fallbackLabel,
  );
  if (
    teamDecision.source === "ML_TEAM_MODEL" &&
    teamDecision.confidence > employeeDecision.confidence
  ) {
    return { ...teamDecision, features };
  }
  return { ...employeeDecision, features };
};

export async function buildEodSuggestion(
  employeeId: string,
  date: string,
  options: BuildEodSuggestionOptions = {},
) {
  const { start, end } = getBusinessDayBounds(date);
  const [todo, pastEods, teamEods, assignedTasks, events] = await Promise.all([
    DailyTodo.findOne({ employeeId, date }).lean(),
    EodReport.find({ employeeId, date: { $lt: date } })
      .sort({ date: -1 })
      .limit(20)
      .select("date tasksWithTimings completedItems")
      .lean(),
    EodReport.find({ date: { $lt: date } })
      .sort({ date: -1 })
      .limit(120)
      .select("date tasksWithTimings completedItems")
      .lean(),
    AssignedTask.find({
      assignedToEmployeeId: employeeId,
      scheduledFor: date,
      status: { $in: ["COMPLETED", "IN_PROGRESS", "ACCEPTED"] },
    })
      .sort({ completedAt: 1, updatedAt: 1 })
      .lean(),
    ActivityEvent.find({
      employeeId,
      timestamp: { $gte: start, $lte: end },
      invalidated: { $ne: true },
      type: {
        $in: [
          "ACTIVE_WINDOW",
          "IDLE_RESPONSE",
          "BREAK_END",
          "AWAY_WORK_END",
        ] as any[],
      },
    })
      .sort({ timestamp: 1 })
      .lean(),
  ]);

  const rows: SuggestedRow[] = [];
  const employeeModel = createModel(pastEods as any[], "EMPLOYEE");
  const teamModel = createModel(teamEods as any[], "TEAM");

  for (const checkin of (todo?.checkins || []) as any[]) {
    for (const task of checkin.tasks?.length
      ? checkin.tasks
      : (checkin.completedTasks || []).map((text: string) => ({ text }))) {
      const text = String(task.text || "").trim();
      if (!text) continue;
      const duration = task.timeTaken ? String(task.timeTaken) : "02:00";
      pushUnique(rows, {
        task: text,
        interval: checkin.interval || "",
        hours: duration,
        count: Number.isInteger(Number(task.count))
          ? Number(task.count)
          : undefined,
        isTopTask: Boolean(task.isTopTask),
        confidence: task.timeTaken ? 0.96 : 0.82,
        source: "CHECKIN",
        evidence: ["Already recorded in check-in"],
      });
      if (task.timeTaken) rows[rows.length - 1].hours = String(task.timeTaken);
    }
  }

  for (const item of (todo?.items || []) as any[]) {
    if (!item?.done) continue;
    const completedAt = item.completedAt ? new Date(item.completedAt) : null;
    const slotStart =
      completedAt && !Number.isNaN(completedAt.getTime())
        ? new Date(completedAt.getTime() - 60 * 60 * 1000)
        : start;
    const slotEnd =
      completedAt && !Number.isNaN(completedAt.getTime())
        ? completedAt
        : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    pushUnique(rows, {
      task: String(item.text || "").trim(),
      interval: intervalLabel(slotStart, slotEnd),
      hours: item.timeTaken || item.estimatedTime || "01:00",
      isTopTask: Boolean(item.isTopTask),
      confidence: item.timeTaken || item.estimatedTime ? 0.88 : 0.72,
      source: "TODO_COMPLETED",
      evidence: ["Marked completed in Todo"],
    });
  }

  for (const task of assignedTasks as any[]) {
    const finishedAt = task.completedAt ? new Date(task.completedAt) : null;
    const slotEnd =
      finishedAt && !Number.isNaN(finishedAt.getTime()) ? finishedAt : end;
    const slotStart = task.startedAt
      ? new Date(task.startedAt)
      : new Date(slotEnd.getTime() - 60 * 60 * 1000);
    pushUnique(rows, {
      task: String(task.title || "").trim(),
      interval: intervalLabel(slotStart, slotEnd),
      hours: task.actualTime || task.estimatedTime || "01:00",
      confidence: task.status === "COMPLETED" ? 0.9 : 0.68,
      source: "ASSIGNED_TASK",
      evidence: [`Assigned task status: ${task.status}`],
    });
  }

  const telemetryBuckets = new Map<
    string,
    { start: Date; end: Date; seconds: number; labels: Map<string, number> }
  >();
  for (const event of events as any[]) {
    if (event.type !== "ACTIVE_WINDOW") continue;
    const ts = new Date(event.timestamp);
    const bucketStart = new Date(ts);
    bucketStart.setMinutes(bucketStart.getMinutes() < 30 ? 0 : 30, 0, 0);
    const bucketMs =
      start.getTime() +
      Math.floor(
        (bucketStart.getTime() - start.getTime()) / (2 * 60 * 60_000),
      ) *
        2 *
        60 *
        60_000;
    const slotStart = new Date(Math.max(start.getTime(), bucketMs));
    const slotEnd = new Date(
      Math.min(end.getTime(), slotStart.getTime() + 2 * 60 * 60_000),
    );
    const key = intervalLabel(slotStart, slotEnd);
    const bucket =
      telemetryBuckets.get(key) ||
      ({
        start: slotStart,
        end: slotEnd,
        seconds: 0,
        labels: new Map<string, number>(),
      } as any);
    const seconds = eventDurationSeconds(event);
    const label = appLabel(event.metadata);
    bucket.seconds += seconds;
    bucket.labels.set(label, (bucket.labels.get(label) || 0) + seconds);
    telemetryBuckets.set(key, bucket);
  }

  for (const [interval, bucket] of telemetryBuckets) {
    if (bucket.seconds < 10 * 60) continue;
    if (rows.some((row) => row.interval === interval && row.task.trim()))
      continue;
    const topLabels = Array.from(bucket.labels.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const decision = makeMlDecision(
      employeeModel,
      teamModel,
      interval,
      topLabels,
    );
    const taskName = decision.task;
    const durationMinutes = Math.min(
      120,
      Math.max(
        15,
        decision.source.startsWith("ML_")
          ? Math.min(
              bucket.seconds / 60,
              decision.estimatedMinutes || bucket.seconds / 60,
            )
          : bucket.seconds / 60,
      ),
    );
    pushUnique(rows, {
      task: taskName,
      interval,
      hours: formatMinutes(durationMinutes),
      confidence: decision.confidence,
      source: decision.source,
      isTopTask: decision.isTopTask,
      evidence: topLabels
        .slice(0, 3)
        .map(([label, seconds]) => `${label}: ${formatMinutes(seconds / 60)}`),
      decision: {
        engine: "EOD_TASK_DECISION_ENGINE_V1",
        predictedTask: taskName,
        confidence: Number(decision.confidence.toFixed(3)),
        alternatives: decision.alternatives,
        features: decision.features,
      },
    });
  }

  rows.sort((a, b) => a.interval.localeCompare(b.interval));
  rows.slice(0, 3).forEach((row) => {
    row.isTopTask = row.isTopTask || row.confidence >= 0.85;
  });

  const telemetrySummary = Array.from(telemetryBuckets.entries()).map(
    ([interval, bucket]) => ({
      interval,
      totalMinutes: Math.round(bucket.seconds / 60),
      topSignals: Array.from(bucket.labels.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, seconds]) => `${label}: ${formatMinutes(seconds / 60)}`),
    }),
  );

  const localModelSummary = {
    engine: "EOD_TASK_DECISION_ENGINE_V1",
    employeeTrainingExamples: employeeModel.trainedExamples,
    teamTrainingExamples: teamModel.trainedExamples,
    learnedEmployeeTasks: employeeModel.profiles.length,
    learnedTeamTasks: teamModel.profiles.length,
  };

  let finalRows = rows;
  let ai = {
    used: false,
    brain: "LOCAL_EMPLOYEE_MODEL_ONLY",
    reason:
      options.includeAi === false
        ? "AI disabled for this request"
        : "Claude not requested",
  } as any;

  if (options.includeAi !== false) {
    try {
      const enhanced = await enhanceWithClaude({
        employeeId,
        date,
        rows,
        model: localModelSummary,
        telemetrySummary,
        todo,
        assignedTasks: assignedTasks as any[],
      });
      finalRows = enhanced.rows;
      ai = enhanced.ai;
    } catch (error) {
      ai = {
        used: false,
        brain: getClaudeStatus().model,
        reason:
          error instanceof Error
            ? `Claude unavailable; used local employee model. ${error.message}`
            : "Claude unavailable; used local employee model.",
      };
    }
  }

  return {
    employeeId,
    date,
    rows: finalRows,
    summary: {
      suggestedRows: finalRows.length,
      highConfidenceRows: finalRows.filter((row) => row.confidence >= 0.8)
        .length,
      sources: Array.from(new Set(finalRows.map((row) => row.source))),
      model: localModelSummary,
      brain: ai,
    },
  };
}

const normalizeIntervalLabel = (value: string) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/-/g, "–")
    .trim()
    .toUpperCase();

const isSameCheckinInterval = (
  rowInterval: string,
  requestedInterval: string,
) => {
  const row = normalizeIntervalLabel(rowInterval);
  const requested = normalizeIntervalLabel(requestedInterval);
  if (!requested) return true;
  if (row === requested) return true;

  const rowHour = intervalStartHour(rowInterval);
  const requestedHour = intervalStartHour(requestedInterval);
  if (rowHour === null || requestedHour === null) return false;
  return Math.abs(rowHour - requestedHour) <= 1;
};

export async function buildCheckinSuggestion(
  employeeId: string,
  date: string,
  interval: string,
  options: BuildEodSuggestionOptions = {},
) {
  const suggestion = await buildEodSuggestion(employeeId, date, options);
  const requestedInterval = String(interval || "").trim();
  const matchedRows = suggestion.rows.filter((row) =>
    isSameCheckinInterval(row.interval, requestedInterval),
  );
  const fallbackRows = matchedRows.length
    ? matchedRows
    : suggestion.rows
        .filter((row) =>
          [
            "CHECKIN",
            "TODO_COMPLETED",
            "ASSIGNED_TASK",
            "ML_EMPLOYEE_MODEL",
            "ML_TEAM_MODEL",
            "TELEMETRY",
            "CLAUDE_EMPLOYEE_DECISION_ENGINE",
          ].includes(row.source),
        )
        .slice(0, 4);

  return {
    employeeId,
    date,
    interval: requestedInterval,
    items: fallbackRows.slice(0, 6).map((row) => ({
      text: row.task,
      timeTaken: row.hours,
      count: row.count,
      isTopTask: Boolean(row.isTopTask),
      interval: requestedInterval || row.interval,
      confidence: row.confidence,
      source: row.source,
      evidence: row.evidence,
      decision: row.decision,
    })),
    summary: {
      ...suggestion.summary,
      requestedInterval,
      matchedRows: matchedRows.length,
    },
  };
}
