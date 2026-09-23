"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  Clock3,
  Coffee,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type Employee = {
  employeeId: string;
  name: string;
  email?: string;
  departmentName?: string;
};
type BreakSchedule = {
  _id: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  durationMinutes: number;
  fullDayAllowanceMinutes?: number;
  halfDayAllowanceMinutes?: number;
  templateName?: string;
  activeDays: string[];
  message?: string;
  reasonOptions?: string[];
  requireReasonOnReturn?: boolean;
  isActive: boolean;
};
type SlotDraft = {
  id: string;
  startTime: string;
  durationMinutes: number;
  activeDays: string[];
};
type Roster = {
  name: string;
  employeeIds: Set<string>;
  employees: Employee[];
  slots: Array<{
    key: string;
    startTime: string;
    durationMinutes: number;
    activeDays: string[];
    message?: string;
    reasonOptions?: string[];
    requireReasonOnReturn?: boolean;
  }>;
  fullDayAllowanceMinutes: number;
  halfDayAllowanceMinutes: number;
};

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const WEEKDAYS = DAYS.slice(0, 5);
const newSlot = (): SlotDraft => ({
  id: crypto.randomUUID(),
  startTime: "13:30",
  durationMinutes: 45,
  activeDays: WEEKDAYS,
});
const slotKey = (
  slot: Pick<BreakSchedule, "startTime" | "durationMinutes" | "activeDays">,
) =>
  `${slot.startTime}|${slot.durationMinutes}|${[...(slot.activeDays || [])].sort().join(",")}`;
const dayLabel = (activeDays: string[]) => {
  const value = [...activeDays].sort().join("|");
  if (value === [...WEEKDAYS].sort().join("|")) return "Mon–Fri";
  if (value === "SATURDAY") return "Saturday";
  if (value === [...DAYS].sort().join("|")) return "Every day";
  return activeDays.map((day) => day.slice(0, 3)).join(", ");
};

function EmployeePicker({
  employees,
  selected,
  setSelected,
  search,
  setSearch,
  accent = "indigo",
}: {
  employees: Employee[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  search: string;
  setSearch: (value: string) => void;
  accent?: "indigo" | "amber";
}) {
  const filtered = employees.filter((employee) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      [
        employee.name,
        employee.employeeId,
        employee.email,
        employee.departmentName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  });
  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search employee, ID or department"
          className="w-full outline-none"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setSelected(filtered.map((employee) => employee.employeeId))
          }
          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700"
        >
          Select all shown
        </button>
        <button
          type="button"
          onClick={() => setSelected([])}
          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600"
        >
          Clear
        </button>
        <span className="px-2 py-1.5 text-xs font-black text-slate-500">
          {selected.length} selected
        </span>
      </div>
      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto rounded-2xl border border-slate-200 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.length ? (
          filtered.map((employee) => {
            const active = selected.includes(employee.employeeId);
            return (
              <button
                key={employee.employeeId}
                type="button"
                onClick={() =>
                  setSelected(
                    active
                      ? selected.filter((id) => id !== employee.employeeId)
                      : [...selected, employee.employeeId],
                  )
                }
                className={`flex items-center gap-3 rounded-xl border p-3 text-left ${active ? (accent === "amber" ? "border-amber-300 bg-amber-50" : "border-indigo-300 bg-indigo-50") : "border-slate-200 bg-white"}`}
              >
                <span
                  className={`grid h-5 w-5 flex-none place-items-center rounded-md border ${active ? (accent === "amber" ? "border-amber-500 bg-amber-500" : "border-indigo-600 bg-indigo-600") + " text-white" : "border-slate-300"}`}
                >
                  {active ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-900">
                    {employee.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {employee.employeeId}
                    {employee.departmentName
                      ? ` · ${employee.departmentName}`
                      : ""}
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <p className="p-3 text-sm text-slate-500">No employees available.</p>
        )}
      </div>
    </div>
  );
}

export default function BreakSchedulerPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canEdit = user?.role === "SUPER_ADMIN";
  const [rosterName, setRosterName] = useState("");
  const [fullAllowance, setFullAllowance] = useState(45);
  const [halfAllowance, setHalfAllowance] = useState(20);
  const [slots, setSlots] = useState<SlotDraft[]>([newSlot()]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [assignmentRoster, setAssignmentRoster] = useState("");
  const [assignmentIds, setAssignmentIds] = useState<string[]>([]);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [notice, setNotice] = useState("");

  const { data: schedules = [], isLoading } = useQuery<BreakSchedule[]>({
    queryKey: ["break-schedules"],
    queryFn: () =>
      api
        .get("/api/daily-flow/break-schedules")
        .then((response) => response.data.data),
  });
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((response) => response.data.data),
  });
  const employees: Employee[] = useMemo(() => {
    const rows = Array.isArray(usersData) ? usersData : usersData?.users || [];
    return rows
      .filter((employee: Employee) => employee.employeeId)
      .sort((a: Employee, b: Employee) => a.name.localeCompare(b.name));
  }, [usersData]);
  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.employeeId, employee])),
    [employees],
  );

  const rosters = useMemo<Roster[]>(() => {
    const groups = new Map<string, BreakSchedule[]>();
    schedules.forEach((schedule) => {
      const name =
        schedule.templateName?.trim() || `Untitled · ${schedule.startTime}`;
      groups.set(name, [...(groups.get(name) || []), schedule]);
    });
    return Array.from(groups.entries())
      .map(([name, rows]) => {
        const uniqueSlots = new Map<string, Roster["slots"][number]>();
        rows.forEach((row) => {
          const key = slotKey(row);
          if (!uniqueSlots.has(key))
            uniqueSlots.set(key, {
              key,
              startTime: row.startTime,
              durationMinutes: row.durationMinutes,
              activeDays: row.activeDays || DAYS,
              message: row.message,
              reasonOptions: row.reasonOptions,
              requireReasonOnReturn: row.requireReasonOnReturn,
            });
        });
        const ids = new Set(rows.map((row) => row.employeeId));
        return {
          name,
          employeeIds: ids,
          employees: Array.from(ids)
            .map(
              (id) =>
                employeeById.get(id) || {
                  employeeId: id,
                  name:
                    rows.find((row) => row.employeeId === id)?.employeeName ||
                    id,
                },
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
          slots: Array.from(uniqueSlots.values()).sort((a, b) =>
            a.startTime.localeCompare(b.startTime),
          ),
          fullDayAllowanceMinutes: Math.max(
            ...rows.map((row) => Number(row.fullDayAllowanceMinutes || 45)),
          ),
          halfDayAllowanceMinutes: Math.max(
            ...rows.map((row) => Number(row.halfDayAllowanceMinutes || 20)),
          ),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employeeById, schedules]);

  const chosenRoster = rosters.find(
    (roster) => roster.name === assignmentRoster,
  );
  const unassignedEmployees = employees.filter(
    (employee) => !chosenRoster?.employeeIds.has(employee.employeeId),
  );
  const dailyTotals = useMemo(() => {
    const totals = new Map(DAYS.map((day) => [day, 0]));
    slots.forEach((slot) =>
      slot.activeDays.forEach((day) =>
        totals.set(
          day,
          (totals.get(day) || 0) + Number(slot.durationMinutes || 0),
        ),
      ),
    );
    return totals;
  }, [slots]);
  const overAllowance = Array.from(dailyTotals.entries()).find(
    ([, minutes]) => minutes > fullAllowance,
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["break-schedules"] });

  const createRoster = useMutation({
    mutationFn: async () => {
      const name = rosterName.trim();
      if (!name) throw new Error("Enter a roster name.");
      if (!employeeIds.length) throw new Error("Select at least one employee.");
      if (
        !slots.length ||
        slots.some((slot) => !slot.startTime || !slot.activeDays.length)
      )
        throw new Error("Every break slot needs a time and at least one day.");
      if (overAllowance)
        throw new Error(
          `${overAllowance[0].slice(0, 3)} has ${overAllowance[1]} planned minutes, above the ${fullAllowance}-minute allowance.`,
        );
      for (const slot of slots)
        await api.post("/api/daily-flow/break-schedules", {
          employeeIds,
          templateName: name,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
          fullDayAllowanceMinutes: fullAllowance,
          halfDayAllowanceMinutes: halfAllowance,
          activeDays: slot.activeDays,
        });
    },
    onSuccess: () => {
      setNotice(`Roster “${rosterName.trim()}” created and assigned.`);
      setRosterName("");
      setFullAllowance(45);
      setHalfAllowance(20);
      setSlots([newSlot()]);
      setEmployeeIds([]);
      setEmployeeSearch("");
      refresh();
    },
    onError: (error: any) =>
      setNotice(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "Could not create roster.",
      ),
  });

  const assignEmployees = useMutation({
    mutationFn: async () => {
      if (!chosenRoster) throw new Error("Select a roster.");
      if (!assignmentIds.length) throw new Error("Select employees to add.");
      for (const slot of chosenRoster.slots)
        await api.post("/api/daily-flow/break-schedules", {
          employeeIds: assignmentIds,
          templateName: chosenRoster.name,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
          fullDayAllowanceMinutes: chosenRoster.fullDayAllowanceMinutes,
          halfDayAllowanceMinutes: chosenRoster.halfDayAllowanceMinutes,
          activeDays: slot.activeDays,
          message: slot.message || "",
          reasonOptions: slot.reasonOptions || [],
          requireReasonOnReturn: Boolean(slot.requireReasonOnReturn),
        });
    },
    onSuccess: () => {
      setNotice(
        `${assignmentIds.length} employee${assignmentIds.length === 1 ? "" : "s"} added to “${assignmentRoster}”.`,
      );
      setAssignmentIds([]);
      setAssignmentSearch("");
      refresh();
    },
    onError: (error: any) =>
      setNotice(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "Could not assign employees.",
      ),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
            <Coffee className="h-4 w-4" /> Break rosters
          </div>
          <h1 className="mt-3 text-2xl font-black text-slate-950">
            Break timetable & employee rosters
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Build a reusable break timetable, then place employees into that
            roster.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Rosters
            </p>
            <p className="text-xl font-black text-slate-950">
              {rosters.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Assigned
            </p>
            <p className="text-xl font-black text-slate-950">
              {new Set(schedules.map((schedule) => schedule.employeeId)).size}
            </p>
          </div>
        </div>
      </header>
      {notice ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700">
          {notice}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
          <CalendarDays className="h-5 w-5 text-indigo-600" /> Existing rosters
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Each roster shows its timetable and assigned employees.
        </p>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Loading rosters…
          </div>
        ) : rosters.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No roster yet. Create the first timetable below.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {rosters.map((roster) => (
              <article
                key={roster.name}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-slate-950">{roster.name}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      Full day {roster.fullDayAllowanceMinutes} min · Half day{" "}
                      {roster.halfDayAllowanceMinutes} min
                    </p>
                  </div>
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-700">
                    {roster.employees.length} employees
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {roster.slots.map((slot) => (
                    <div
                      key={slot.key}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <span className="flex items-center gap-2 font-black text-slate-900">
                        <Clock3 className="h-4 w-4 text-indigo-600" />
                        {slot.startTime}
                      </span>
                      <span className="text-sm font-bold text-slate-600">
                        {slot.durationMinutes} min
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {dayLabel(slot.activeDays)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {roster.employees.slice(0, 8).map((employee) => (
                    <span
                      key={employee.employeeId}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200"
                    >
                      {employee.name}
                    </span>
                  ))}
                  {roster.employees.length > 8 ? (
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-black text-slate-600">
                      +{roster.employees.length - 8} more
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {canEdit ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
            Step 1
          </span>
          <h2 className="mt-3 text-lg font-black text-slate-950">
            Create a break timetable
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Name the roster, set allowances, and add as many slots as needed.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="text-sm font-bold text-slate-700">
              Roster name
              <input
                value={rosterName}
                onChange={(event) => setRosterName(event.target.value)}
                placeholder="Example: Roster A"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="text-sm font-bold text-slate-700">
              Full-day allowance
              <div className="mt-1 flex items-center rounded-xl border border-slate-200 px-3">
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={fullAllowance}
                  onChange={(event) =>
                    setFullAllowance(Number(event.target.value) || 45)
                  }
                  className="w-full py-2.5 outline-none"
                />
                <span className="text-xs font-bold text-slate-400">
                  minutes
                </span>
              </div>
            </label>
            <label className="text-sm font-bold text-slate-700">
              Half-day allowance
              <div className="mt-1 flex items-center rounded-xl border border-slate-200 px-3">
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={halfAllowance}
                  onChange={(event) =>
                    setHalfAllowance(Number(event.target.value) || 20)
                  }
                  className="w-full py-2.5 outline-none"
                />
                <span className="text-xs font-bold text-slate-400">
                  minutes
                </span>
              </div>
            </label>
          </div>
          <div className="mt-5 space-y-3">
            {slots.map((slot, index) => (
              <div
                key={slot.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-black text-slate-900">
                    Break slot {index + 1}
                  </p>
                  {slots.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSlots((current) =>
                          current.filter((item) => item.id !== slot.id),
                        )
                      }
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[180px_180px_1fr]">
                  <label className="text-sm font-bold text-slate-700">
                    Start time
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={(event) =>
                        setSlots((current) =>
                          current.map((item) =>
                            item.id === slot.id
                              ? { ...item, startTime: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                    />
                  </label>
                  <label className="text-sm font-bold text-slate-700">
                    Duration
                    <div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-white px-3">
                      <input
                        type="number"
                        min={5}
                        max={180}
                        value={slot.durationMinutes}
                        onChange={(event) =>
                          setSlots((current) =>
                            current.map((item) =>
                              item.id === slot.id
                                ? {
                                    ...item,
                                    durationMinutes:
                                      Number(event.target.value) || 5,
                                  }
                                : item,
                            ),
                          )
                        }
                        className="w-full py-2.5 outline-none"
                      />
                      <span className="text-xs font-bold text-slate-400">
                        min
                      </span>
                    </div>
                  </label>
                  <div>
                    <p className="text-sm font-bold text-slate-700">Days</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {DAYS.map((day) => {
                        const active = slot.activeDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() =>
                              setSlots((current) =>
                                current.map((item) =>
                                  item.id === slot.id
                                    ? {
                                        ...item,
                                        activeDays: active
                                          ? item.activeDays.filter(
                                              (value) => value !== day,
                                            )
                                          : [...item.activeDays, day],
                                      }
                                    : item,
                                ),
                              )
                            }
                            className={`rounded-lg px-2.5 py-2 text-xs font-black ${active ? "bg-indigo-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSlots((current) => [...current, newSlot()])}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-black text-indigo-700"
            >
              <Plus className="h-4 w-4" /> Add another slot
            </button>
            {overAllowance ? (
              <p className="text-sm font-bold text-red-600">
                {overAllowance[0].slice(0, 3)} uses {overAllowance[1]} min,
                above the {fullAllowance}-min allowance.
              </p>
            ) : (
              <p className="text-sm font-bold text-emerald-600">
                Timetable is within the daily allowance.
              </p>
            )}
          </div>
          <div className="mt-7 border-t border-slate-100 pt-6">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              Step 2
            </span>
            <h3 className="mt-3 flex items-center gap-2 text-lg font-black text-slate-950">
              <Users className="h-5 w-5 text-emerald-600" /> Add employees to
              this roster
            </h3>
            <div className="mt-4">
              <EmployeePicker
                employees={employees}
                selected={employeeIds}
                setSelected={setEmployeeIds}
                search={employeeSearch}
                setSearch={setEmployeeSearch}
              />
            </div>
            <button
              type="button"
              disabled={createRoster.isPending || Boolean(overAllowance)}
              onClick={() => createRoster.mutate()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {createRoster.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}{" "}
              Create roster & assign employees
            </button>
          </div>
        </section>
      ) : null}

      {canEdit && rosters.length ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
            Add employees later
          </span>
          <h2 className="mt-3 text-lg font-black text-slate-950">
            Place employees into an existing roster
          </h2>
          <label className="mt-5 block max-w-sm text-sm font-bold text-slate-700">
            Select roster
            <select
              value={assignmentRoster}
              onChange={(event) => {
                setAssignmentRoster(event.target.value);
                setAssignmentIds([]);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <option value="">Choose a roster…</option>
              {rosters.map((roster) => (
                <option key={roster.name} value={roster.name}>
                  {roster.name}
                </option>
              ))}
            </select>
          </label>
          {chosenRoster ? (
            <div className="mt-4">
              <EmployeePicker
                employees={unassignedEmployees}
                selected={assignmentIds}
                setSelected={setAssignmentIds}
                search={assignmentSearch}
                setSearch={setAssignmentSearch}
                accent="amber"
              />
            </div>
          ) : null}
          <button
            type="button"
            disabled={
              !chosenRoster ||
              !assignmentIds.length ||
              assignEmployees.isPending
            }
            onClick={() => assignEmployees.mutate()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {assignEmployees.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}{" "}
            Add selected employees to roster
          </button>
        </section>
      ) : null}
    </div>
  );
}
