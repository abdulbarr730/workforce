"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Coffee,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";

type Employee = { employeeId: string; name: string; email?: string };
type BreakSchedule = {
  _id: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  durationMinutes: number;
  templateName?: string;
  startDate?: string;
  endDate?: string;
  specificDates?: string[];
  message?: string;
  reasonOptions?: string[];
  requireReasonOnReturn?: boolean;
  activeDays: string[];
  isActive: boolean;
};
type BreakReportRow = {
  employeeId: string;
  employeeName: string;
  date: string;
  start: string;
  end: string;
  actualSeconds: number;
  plannedSeconds: number;
  dailyAllowanceSeconds?: number;
  exceeded: boolean;
  exceededBySeconds: number;
  reason?: string | null;
};

const days = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

const defaultForm = {
  employeeId: "",
  employeeIds: [] as string[],
  templateName: "",
  startTime: "13:30",
  durationMinutes: 45,
  startDate: "",
  endDate: "",
  specificDatesText: "",
  message: "",
  reasonOptions: "",
  requireReasonOnReturn: false,
  activeDays: days,
};

function parseSheetText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const first = lines[0].toLowerCase();
  const hasHeader =
    first.includes("employee") || first.includes("name") || first.includes("time");
  const body = hasHeader ? lines.slice(1) : lines;

  return body.map((line) => {
    const parts = line.includes("\t") ? line.split("\t") : line.split(",");
    const clean = parts.map((part) => part.trim());
    return {
      employeeId: clean[0],
      employeeName: clean[1],
      startTime: clean[2],
      durationMinutes: clean[3] || 45,
      activeDays: clean[4] || "",
      message: clean[5] || "",
      reasonOptions: clean[6] || "",
      requireReasonOnReturn: /^(yes|true|1|required|mandatory)$/i.test(
        clean[7] || "",
      ),
      startDate: clean[8] || "",
      endDate: clean[9] || "",
      specificDates: clean[10] || "",
      templateName: clean[11] || "",
    };
  });
}

function parseDateList(text: string) {
  return Array.from(
    new Set(
      text
        .split(/[,\n|]+/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );
}

function setDayPattern(
  updater: Dispatch<SetStateAction<typeof defaultForm>>,
  pattern: "WEEKDAYS" | "SATURDAY" | "ALL",
) {
  updater((prev) => ({
    ...prev,
    activeDays:
      pattern === "WEEKDAYS"
        ? weekdays
        : pattern === "SATURDAY"
          ? ["SATURDAY"]
          : days,
    specificDatesText: "",
  }));
}

function fmtSeconds(totalSeconds = 0) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function BreakSchedulerPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(defaultForm);
  const [sheetText, setSheetText] = useState("");
  const [notice, setNotice] = useState("");
  const [reportRange, setReportRange] = useState("week");
  const [durationFilter, setDurationFilter] = useState("ALL");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportMinMinutes, setReportMinMinutes] = useState("");
  const [reportMaxMinutes, setReportMaxMinutes] = useState("");

  const { data: schedules = [], isLoading } = useQuery<BreakSchedule[]>({
    queryKey: ["break-schedules"],
    queryFn: () =>
      api.get("/api/daily-flow/break-schedules").then((r) => r.data.data),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });
  const { data: report } = useQuery({
    queryKey: [
      "break-usage-report",
      reportRange,
      durationFilter,
      reportStartDate,
      reportEndDate,
      reportMinMinutes,
      reportMaxMinutes,
    ],
    queryFn: () =>
      api
        .get(
          `/api/daily-flow/break-schedules/report?${new URLSearchParams({
            range: reportRange,
            durationFilter,
            startDate: reportStartDate,
            endDate: reportEndDate,
            minMinutes: reportMinMinutes,
            maxMinutes: reportMaxMinutes,
          }).toString()}`,
        )
        .then((r) => r.data.data),
  });
  const employees: Employee[] = Array.isArray(usersData)
    ? usersData
    : (usersData?.users ?? []);

  const employeeOptions = useMemo(
    () =>
      employees
        .filter((employee) => employee.employeeId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["break-schedules"] });

  const createMut = useMutation({
    mutationFn: () =>
      api.post("/api/daily-flow/break-schedules", {
        ...form,
        employeeIds:
          form.employeeIds.length > 0
            ? form.employeeIds
            : form.employeeId
              ? [form.employeeId]
              : [],
        specificDates: parseDateList(form.specificDatesText),
      }),
    onSuccess: (res) => {
      const inserted = res.data?.data?.insertedCount;
      setNotice(
        inserted
          ? `Break template applied to ${inserted} employees.`
          : "Break schedule added.",
      );
      setForm(defaultForm);
      refresh();
    },
  });

  const importMut = useMutation({
    mutationFn: (rows: any[]) =>
      api.post("/api/daily-flow/break-schedules/import", { rows }),
    onSuccess: (res) => {
      const data = res.data.data;
      setNotice(
        `Imported ${data.insertedCount} break schedules${
          data.errors?.length ? `, ${data.errors.length} rows skipped` : ""
        }.`,
      );
      setSheetText("");
      refresh();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BreakSchedule> }) =>
      api.patch(`/api/daily-flow/break-schedules/${id}`, data),
    onSuccess: refresh,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/daily-flow/break-schedules/${id}`),
    onSuccess: refresh,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, BreakSchedule[]>();
    schedules.forEach((schedule) => {
      const key = `${schedule.employeeName} (${schedule.employeeId})`;
      map.set(key, [...(map.get(key) || []), schedule]);
    });
    return Array.from(map.entries());
  }, [schedules]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
            <Coffee className="h-4 w-4" /> Break Scheduler
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-950">
            Scheduled employee breaks
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Add daily break reminders manually or paste rows from a sheet. The
            employee agent will remind them and record break start/end time.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <span className="font-bold text-slate-950">{schedules.length}</span>{" "}
          break slots configured
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
            <Plus className="h-5 w-5 text-indigo-600" /> Create break template
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
              Template name
              <input
                value={form.templateName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, templateName: e.target.value }))
                }
                placeholder="Example: Weekday lunch, Saturday short break"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
              Employees for this template
              <select
                multiple
                value={form.employeeIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map(
                    (option) => option.value,
                  );
                  setForm((prev) => ({
                    ...prev,
                    employeeIds: selected,
                    employeeId: selected[0] || "",
                  }));
                }}
                className="mt-1 h-36 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {employeeOptions.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>
                    {employee.name} · {employee.employeeId}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Hold Ctrl/Shift to select multiple people. One template creates
                one break slot for each selected employee.
              </span>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Break time
              <input
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, startTime: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Duration minutes
              <input
                type="number"
                min={5}
                max={180}
                value={form.durationMinutes}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    durationMinutes: Number(e.target.value) || 45,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="sm:col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
              <p className="text-sm font-black uppercase tracking-wider text-indigo-700">
                Break pattern
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Configure like shifts: weekday break, Saturday break, all days,
                or your own day selection.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDayPattern(setForm, "WEEKDAYS")}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                >
                  Mon–Fri
                </button>
                <button
                  type="button"
                  onClick={() => setDayPattern(setForm, "SATURDAY")}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-amber-700 shadow-sm ring-1 ring-amber-100"
                >
                  Saturday
                </button>
                <button
                  type="button"
                  onClick={() => setDayPattern(setForm, "ALL")}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-100"
                >
                  All days
                </button>
              </div>
            </div>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
              Friendly reminder line
              <input
                value={form.message}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, message: e.target.value }))
                }
              placeholder="Optional — otherwise agent picks a cheerful line"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
              Return reason dropdown options
              <input
                value={form.reasonOptions}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, reasonOptions: e.target.value }))
                }
                placeholder="Write admin-approved options separated by commas. Add Other/Others to allow custom text."
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Separate options with commas. Nothing is auto-added by the
                agent; these are the only dropdown options employees see.
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.requireReasonOnReturn}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    requireReasonOnReturn: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Make return reason mandatory
            </label>
          </div>
          <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-black text-slate-700">
              Advanced exact dates / temporary override
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                From date
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                To date
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Specific dates only
                <textarea
                  value={form.specificDatesText}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      specificDatesText: e.target.value,
                    }))
                  }
                  placeholder="Optional: 2026-09-12, 2026-09-19. If filled, this overrides weekday matching."
                  className="mt-1 h-20 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>
          </details>
          <div className="mt-4 flex flex-wrap gap-2">
            {days.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    activeDays: prev.activeDays.includes(day)
                      ? prev.activeDays.filter((item) => item !== day)
                      : [...prev.activeDays, day],
                  }))
                }
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  form.activeDays.includes(day)
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
          <button
            onClick={() => createMut.mutate()}
            disabled={form.employeeIds.length === 0 || createMut.isPending}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
          >
            {createMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Apply template
          </button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
            <Upload className="h-5 w-5 text-amber-600" /> Import from sheet
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Paste columns as: employeeId, employee name, time, duration, days,
            message, reasons, reason required, from date, to date, specific
            dates, template name. Tabs copied from Excel/Sheets also work.
          </p>
          <textarea
            value={sheetText}
            onChange={(e) => setSheetText(e.target.value)}
            placeholder={`EMP_01_02, Abdul Barr, 14:15, 15, MONDAY TUESDAY WEDNESDAY THURSDAY FRIDAY, Time for a quick recharge, Option A|Option B|Other, yes, 2026-09-10, 2026-09-30, , Weekday short break\nEMP_03_03, Harshita Prajapati, 16:30, 30, SATURDAY, Saturday recharge, Option A|Others, no, , , 2026-09-12|2026-09-19, Saturday special`}
            className="mt-4 h-48 w-full rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            onClick={() => importMut.mutate(parseSheetText(sheetText))}
            disabled={!sheetText.trim() || importMut.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
          >
            {importMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Import rows
          </button>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
            <CalendarDays className="h-5 w-5 text-indigo-600" /> Configured
            breaks
          </h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-sm text-slate-500">Loading breaks…</div>
        ) : grouped.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            No scheduled breaks yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {grouped.map(([employee, items]) => (
              <div key={employee} className="p-5">
                <h3 className="font-bold text-slate-900">{employee}</h3>
                <div className="mt-3 grid gap-3">
                  {items.map((item) => (
                    <div
                      key={item._id}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        {item.templateName && (
                          <p className="mb-1 text-xs font-black uppercase tracking-wider text-indigo-600">
                            {item.templateName}
                          </p>
                        )}
                        <p className="font-bold text-slate-950">
                          {item.startTime} · {item.durationMinutes} min
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.activeDays.map((day) => day.slice(0, 3)).join(", ")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.specificDates?.length
                            ? `Specific: ${item.specificDates.join(", ")}`
                            : item.startDate || item.endDate
                              ? `${item.startDate || "Any start"} → ${item.endDate || "No end"}`
                              : "No date limit"}
                        </p>
                        {item.message && (
                          <p className="mt-1 text-sm text-slate-600">
                            “{item.message}”
                          </p>
                        )}
                        {item.reasonOptions?.length ? (
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Reasons: {item.reasonOptions.join(", ")}
                            {item.requireReasonOnReturn ? " · required" : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            updateMut.mutate({
                              id: item._id,
                              data: { ...item, isActive: !item.isActive },
                            })
                          }
                          className={`rounded-xl px-3 py-2 text-xs font-bold ${
                            item.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {item.isActive ? "Active" : "Paused"}
                        </button>
                        <button
                          onClick={() => deleteMut.mutate(item._id)}
                          className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Break usage & exceeded report
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Tracks actual break start/stop events from employee agents.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={reportRange}
              onChange={(e) => setReportRange(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
            <select
              value={durationFilter}
              onChange={(e) => setDurationFilter(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All breaks</option>
              <option value="EXCEEDED">Exceeded planned time</option>
              <option value="GT_45">More than 45 min</option>
              <option value="LT_30">Less than 30 min</option>
              <option value="LT_10">Less than 10 min</option>
            </select>
            <input
              type="date"
              value={reportStartDate}
              onChange={(e) => setReportStartDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
              title="Report from date"
            />
            <input
              type="date"
              value={reportEndDate}
              onChange={(e) => setReportEndDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
              title="Report to date"
            />
            <input
              type="number"
              min={0}
              value={reportMinMinutes}
              onChange={(e) => setReportMinMinutes(e.target.value)}
              placeholder="Min min"
              className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number"
              min={0}
              value={reportMaxMinutes}
              onChange={(e) => setReportMaxMinutes(e.target.value)}
              placeholder="Max min"
              className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => {
                setReportStartDate("");
                setReportEndDate("");
                setReportMinMinutes("");
                setReportMaxMinutes("");
                setDurationFilter("ALL");
              }}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-600"
            >
              Clear filters
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total breaks
            </p>
            <p className="mt-1 text-2xl font-black text-slate-950">
              {report?.summary?.totalBreaks ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-red-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-red-500">
              Exceeded
            </p>
            <p className="mt-1 text-2xl font-black text-red-600">
              {report?.summary?.exceededBreaks ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-indigo-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">
              Allowance days flagged
            </p>
            <p className="mt-1 text-2xl font-black text-indigo-600">
              {report?.summary?.exceededAllowanceDays ?? 0}
            </p>
          </div>
        </div>

        {(report?.summary?.employeeDays || []).length > 0 && (
          <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <h3 className="text-sm font-black text-indigo-950">
              Daily total break allowance
            </h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(report.summary.employeeDays || [])
                .filter((day: any) => day.exceededAllowanceSeconds > 0)
                .slice(0, 12)
                .map((day: any) => (
                  <div
                    key={`${day.employeeId}-${day.date}`}
                    className="rounded-xl bg-white p-3 text-xs shadow-sm"
                  >
                    <p className="font-black text-slate-900">
                      {day.employeeName} · {day.date}
                    </p>
                    <p className="mt-1 text-slate-600">
                      Total {fmtSeconds(day.totalSeconds)} / allowed{" "}
                      {fmtSeconds(day.allowanceSeconds)}
                    </p>
                    <p className="mt-1 font-black text-red-600">
                      Minus +{fmtSeconds(day.exceededAllowanceSeconds)}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actual</th>
                <th className="px-4 py-3">Planned</th>
                <th className="px-4 py-3">Day Allowance</th>
                <th className="px-4 py-3">Flag</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(report?.rows || []).slice(0, 100).map((row: BreakReportRow, index: number) => (
                <tr key={`${row.employeeId}-${row.start}-${index}`}>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {row.employeeName}
                    <span className="ml-2 text-xs font-semibold text-slate-400">
                      {row.employeeId}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.date}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {fmtTime(row.start)} – {fmtTime(row.end)}
                  </td>
                  <td className="px-4 py-3 font-black text-slate-950">
                    {fmtSeconds(row.actualSeconds)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {fmtSeconds(row.plannedSeconds)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {fmtSeconds(row.dailyAllowanceSeconds || 45 * 60)}
                  </td>
                  <td className="px-4 py-3">
                    {row.exceeded ? (
                      <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-black text-red-700">
                        +{fmtSeconds(row.exceededBySeconds)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
                        OK
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.reason || "—"}
                  </td>
                </tr>
              ))}
              {!report?.rows?.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No break records for this filter yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
