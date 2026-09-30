"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  FileText,
  Star,
} from "lucide-react";
import { api } from "@/lib/api";
import { getStatusColor } from "@/lib/utils";

type TodoItem = { text: string; done?: boolean; isTopTask?: boolean; timeTaken?: string };
type Todo = { date: string; items?: TodoItem[] };
type EodTask = { text: string; interval?: string; timeTaken?: string; count?: number; isTopTask?: boolean };
type Eod = {
  date: string;
  summary?: string;
  top3Tasks?: string[];
  tasksWithTimings?: EodTask[];
  completedItems?: string[];
  blockers?: string;
  hoursWorked?: number | null;
};
type AttendanceRecord = {
  date: string;
  attendanceStatus: string;
  leavePaid?: boolean | null;
  loginTime?: string | null;
  logoutTime?: string | null;
  productiveMinutes?: number;
  totalWorkedMinutes?: number;
};

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Monday of the week that contains `date`. */
const mondayOf = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
};

const clock = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const hours = (minutes?: number) => {
  const m = Math.round(Number(minutes || 0));
  if (!m) return "—";
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
};

const statusText = (record?: AttendanceRecord) => {
  if (!record) return "No record";
  if (record.attendanceStatus === "LEAVE" && record.leavePaid === true) return "Paid leave";
  if (record.attendanceStatus === "LEAVE" && record.leavePaid === false) return "Unpaid leave";
  return record.attendanceStatus.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
};

/**
 * One employee's week at a glance: attendance, hours, To-Do and EOD per day.
 * A day opens to show its To-Do list and EOD; only one day is open at a time.
 */
export function EmployeeWeekPanel({
  employeeId,
  anchorDate,
}: {
  employeeId: string;
  anchorDate: string;
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date(`${anchorDate}T12:00:00`)));
  const [openDay, setOpenDay] = useState<string | null>(null);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );
  const months = useMemo(
    () => Array.from(new Set(days.map((d) => dayKey(d).slice(0, 7)))),
    [days],
  );
  const monthsKey = months.join(",");

  const fetchMonths = async <T,>(path: string) => {
    const all = await Promise.all(
      months.map((m) =>
        api
          .get(`${path}${path.includes("?") ? "&" : "?"}employeeId=${encodeURIComponent(employeeId)}&month=${m}`)
          .then((r) => (Array.isArray(r.data?.data) ? r.data.data : r.data?.data?.items || []) as T[])
          .catch(() => [] as T[]),
      ),
    );
    return all.flat();
  };

  const { data: todos = [], isLoading: loadingTodos } = useQuery({
    queryKey: ["week-todos", employeeId, monthsKey],
    queryFn: () => fetchMonths<Todo>("/api/daily-flow/todos"),
    enabled: Boolean(employeeId),
  });
  const { data: eods = [], isLoading: loadingEods } = useQuery({
    queryKey: ["week-eods", employeeId, monthsKey],
    queryFn: () => fetchMonths<Eod>("/api/daily-flow/eod"),
    enabled: Boolean(employeeId),
  });
  const { data: records = [] } = useQuery({
    queryKey: ["week-attendance", employeeId, monthsKey],
    queryFn: () => fetchMonths<AttendanceRecord>("/api/attendance/records"),
    enabled: Boolean(employeeId),
  });

  const byDate = <T extends { date: string }>(rows: T[]) => {
    const map = new Map<string, T>();
    rows.forEach((row) => map.set(String(row.date).slice(0, 10), row));
    return map;
  };
  const todoOf = byDate(todos);
  const eodOf = byDate(eods);
  const recordOf = byDate(records);

  const rows = days.map((date) => {
    const key = dayKey(date);
    const todo = todoOf.get(key);
    const items = todo?.items || [];
    return {
      key,
      date,
      record: recordOf.get(key),
      todo,
      done: items.filter((i) => i.done).length,
      total: items.length,
      eod: eodOf.get(key),
    };
  });

  const today = dayKey(new Date());
  const pastRows = rows.filter((r) => r.key <= today);
  const worked = pastRows.filter((r) =>
    ["PRESENT", "LATE", "HALF_DAY"].includes(r.record?.attendanceStatus || ""),
  );
  const summary = {
    daysPresent: worked.length,
    productive: pastRows.reduce((s, r) => s + Number(r.record?.productiveMinutes || 0), 0),
    todoDone: pastRows.reduce((s, r) => s + r.done, 0),
    todoTotal: pastRows.reduce((s, r) => s + r.total, 0),
    eods: pastRows.filter((r) => r.eod).length,
    eodDays: worked.length,
  };

  const shiftWeek = (weeks: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + weeks * 7);
    setWeekStart(d);
    setOpenDay(null);
  };
  const rangeLabel = `${days[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-800">
            <CalendarDays className="h-4 w-4 text-indigo-500" /> Week at a glance
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Attendance, hours, To-Do and EOD for each day. Click a day to see its To-Do and EOD.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-slate-50"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[150px] text-center text-sm font-bold text-slate-700">{rangeLabel}</span>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-slate-50"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Week summary */}
      <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-5 md:grid-cols-4">
        {[
          ["Days present", `${summary.daysPresent}`],
          ["Productive time", hours(summary.productive)],
          [
            "To-Do done",
            summary.todoTotal ? `${summary.todoDone}/${summary.todoTotal} (${Math.round((summary.todoDone / summary.todoTotal) * 100)}%)` : "—",
          ],
          ["EODs submitted", summary.eodDays ? `${summary.eods}/${summary.eodDays}` : `${summary.eods}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-0.5 text-lg font-black text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Days */}
      {loadingTodos || loadingEods ? (
        <p className="p-5 text-sm text-slate-500">Loading the week…</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => {
            const isOpen = openDay === row.key;
            const future = row.key > today;
            return (
              <div key={row.key}>
                <button
                  type="button"
                  onClick={() => setOpenDay(isOpen ? null : row.key)}
                  className={`grid w-full grid-cols-[110px_1fr] items-center gap-3 px-5 py-3 text-left transition-colors md:grid-cols-[130px_150px_1fr_110px_110px_24px] ${isOpen ? "bg-indigo-50/60" : "hover:bg-slate-50"} ${future ? "opacity-50" : ""}`}
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {row.date.toLocaleDateString("en-IN", { weekday: "short" })}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${getStatusColor(row.record?.attendanceStatus || "")}`}
                    >
                      {future ? "—" : statusText(row.record)}
                    </span>
                  </div>
                  <div className="hidden text-xs text-slate-600 md:block">
                    {row.record?.loginTime ? (
                      <>
                        {clock(row.record.loginTime)} – {clock(row.record.logoutTime)}
                        <span className="ml-2 text-slate-400">
                          · {hours(row.record.productiveMinutes)} productive
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">No login</span>
                    )}
                  </div>
                  <div className="hidden items-center gap-1.5 text-xs font-semibold md:flex">
                    <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
                    {row.total ? (
                      <span className={row.done === row.total ? "text-emerald-600" : "text-slate-700"}>
                        {row.done}/{row.total} done
                      </span>
                    ) : (
                      <span className="text-slate-400">No To-Do</span>
                    )}
                  </div>
                  <div className="hidden items-center gap-1.5 text-xs font-semibold md:flex">
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    {row.eod ? (
                      <span className="text-emerald-600">EOD sent</span>
                    ) : (
                      <span className="text-slate-400">No EOD</span>
                    )}
                  </div>
                  <ChevronDown
                    className={`hidden h-4 w-4 text-slate-400 transition-transform md:block ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen ? (
                  <div className="grid gap-4 bg-slate-50/60 px-5 py-4 md:grid-cols-2">
                    {/* To-Do */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <ClipboardList className="h-4 w-4" /> To-Do
                        {row.total ? (
                          <span className="ml-auto normal-case text-slate-400">
                            {row.done} of {row.total} done
                          </span>
                        ) : null}
                      </h3>
                      {row.total ? (
                        <ul className="space-y-1.5">
                          {(row.todo?.items || []).map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              {item.done ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                              ) : (
                                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                              )}
                              <span className={item.done ? "text-slate-500 line-through" : "text-slate-800"}>
                                {item.text}
                              </span>
                              {item.isTopTask ? (
                                <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                              ) : null}
                              {item.timeTaken ? (
                                <span className="ml-auto shrink-0 text-xs text-slate-400">{item.timeTaken}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-400">No To-Do list for this day.</p>
                      )}
                    </div>

                    {/* EOD */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <FileText className="h-4 w-4" /> EOD
                        {row.eod?.hoursWorked ? (
                          <span className="ml-auto normal-case text-slate-400">
                            {row.eod.hoursWorked}h reported
                          </span>
                        ) : null}
                      </h3>
                      {row.eod ? (
                        <div className="space-y-3 text-sm">
                          {row.eod.summary ? (
                            <p className="whitespace-pre-wrap text-slate-800">{row.eod.summary}</p>
                          ) : null}
                          {row.eod.top3Tasks?.length ? (
                            <div>
                              <div className="mb-1 text-xs font-bold text-slate-500">Top 3</div>
                              <ol className="list-inside list-decimal space-y-0.5 text-slate-700">
                                {row.eod.top3Tasks.map((t, i) => (
                                  <li key={i}>{t}</li>
                                ))}
                              </ol>
                            </div>
                          ) : null}
                          {row.eod.tasksWithTimings?.length ? (
                            <div>
                              <div className="mb-1 text-xs font-bold text-slate-500">Tasks</div>
                              <ul className="space-y-1">
                                {row.eod.tasksWithTimings.map((t, i) => (
                                  <li key={i} className="flex gap-2 text-slate-700">
                                    <span className="w-28 shrink-0 text-xs text-slate-400">
                                      {t.interval || t.timeTaken || ""}
                                    </span>
                                    <span>
                                      {t.text}
                                      {t.count ? <span className="text-slate-400"> ×{t.count}</span> : null}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {row.eod.blockers ? (
                            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                              <b>Blockers:</b> {row.eod.blockers}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">No EOD submitted for this day.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
