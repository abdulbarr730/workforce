"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  UserCheck,
} from "lucide-react";
import { api } from "@/lib/api";

type Employee = {
  employeeId: string;
  name: string;
  email?: string;
  departmentName?: string | null;
};

type AssignedTask = {
  id: string;
  _id?: string;
  title: string;
  description?: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status:
    | "REQUESTED"
    | "ACCEPTED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED";
  source: "ADMIN_DASHBOARD" | "TEAMS" | "MANUAL";
  assignedByName: string;
  assignedToEmployeeId: string;
  assignedToName: string;
  assignedToDepartmentName?: string;
  scheduledFor: string;
  deadlineAt?: string | null;
  reminderAt?: string | null;
  reminderFrequency: "OFF" | "DAILY" | "EVERY_2_DAYS" | "TWICE_WEEKLY" | "WEEKLY";
  estimatedTime?: string;
  addToTodo: boolean;
  autoAddToEodOnComplete: boolean;
  todoItemTaskId?: string;
  eodAddedAt?: string | null;
  actualTime?: string;
  completionNote?: string;
  createdAt: string;
  completedAt?: string | null;
};

const todayKey = () => new Date().toLocaleDateString("en-CA");

function toLocalIso(date: string, time: string) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}:00`).toISOString();
}

function prettyDateTime(value?: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusTone: Record<AssignedTask["status"], string> = {
  REQUESTED: "bg-blue-50 text-blue-700 border-blue-200",
  ACCEPTED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function AssignedTasksPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [employeeId, setEmployeeId] = useState("ALL");
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignedToEmployeeId: "",
    scheduledFor: todayKey(),
    deadlineDate: todayKey(),
    deadlineTime: "18:00",
    reminderTime: "",
    reminderFrequency: "OFF",
    priority: "NORMAL",
    estimatedTime: "",
    addToTodo: true,
    autoAddToEodOnComplete: true,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((res) => res.data.data),
  });
  const employees: Employee[] = Array.isArray(usersData)
    ? usersData
    : usersData?.users || [];

  const {
    data: tasks = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<AssignedTask[]>({
    queryKey: ["assigned-tasks", status, employeeId],
    queryFn: () =>
      api
        .get("/api/assigned-tasks", {
          params: { status, employeeId, limit: 300 },
        })
        .then((res) => res.data.data || []),
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.post("/api/assigned-tasks", {
        title: form.title,
        description: form.description,
        assignedToEmployeeId: form.assignedToEmployeeId,
        scheduledFor: form.scheduledFor,
        deadlineAt: toLocalIso(form.deadlineDate, form.deadlineTime),
        reminderAt: toLocalIso(form.scheduledFor, form.reminderTime),
        reminderFrequency: form.reminderFrequency,
        priority: form.priority,
        estimatedTime: form.estimatedTime,
        addToTodo: form.addToTodo,
        autoAddToEodOnComplete: form.autoAddToEodOnComplete,
      }),
    onSuccess: () => {
      setForm((current) => ({
        ...current,
        title: "",
        description: "",
        estimatedTime: "",
        reminderTime: "",
      }));
      qc.invalidateQueries({ queryKey: ["assigned-tasks"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) => api.patch(`/api/assigned-tasks/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assigned-tasks"] }),
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tasks;
    return tasks.filter((task) =>
      [
        task.title,
        task.description || "",
        task.assignedToName,
        task.assignedToEmployeeId,
        task.assignedByName,
        task.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, tasks]);

  const counts = useMemo(() => {
    return tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});
  }, [tasks]);

  const canCreate =
    form.title.trim() && form.assignedToEmployeeId && form.scheduledFor;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/75">
              Management workflow
            </p>
            <h1 className="mt-2 text-3xl font-black">Assigned Tasks</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80">
              Assign trackable work to employees. Tasks can land directly in
              their Todo, move through requested/accepted/in-progress/completed,
              and feed EOD evidence.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white/15 px-4 py-2 text-sm font-bold hover:bg-white/20"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-black text-gray-900">
            Assign a new task
          </h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          <input
            value={form.title}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
            className="input-field lg:col-span-2"
            placeholder="Task title"
          />
          <select
            value={form.assignedToEmployeeId}
            onChange={(event) =>
              setForm({ ...form, assignedToEmployeeId: event.target.value })
            }
            className="input-field"
          >
            <option value="">Assign to employee…</option>
            {employees.map((employee) => (
              <option key={employee.employeeId} value={employee.employeeId}>
                {employee.name} — {employee.employeeId}
              </option>
            ))}
          </select>
          <select
            value={form.priority}
            onChange={(event) =>
              setForm({ ...form, priority: event.target.value })
            }
            className="input-field"
          >
            <option value="NORMAL">Normal priority</option>
            <option value="HIGH">High priority</option>
            <option value="URGENT">Urgent</option>
            <option value="LOW">Low priority</option>
          </select>
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            className="input-field min-h-24 lg:col-span-4"
            placeholder="Description / exact instructions / Teams context"
          />
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.14em] text-gray-500">
            Scheduled date
            <input
              type="date"
              min={todayKey()}
              value={form.scheduledFor}
              onChange={(event) =>
                setForm({ ...form, scheduledFor: event.target.value })
              }
              className="input-field normal-case tracking-normal"
            />
            <span className="text-[11px] font-semibold normal-case tracking-normal text-gray-400">
              The day employee should do this task.
            </span>
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.14em] text-gray-500">
            Deadline date
            <input
              type="date"
              min={form.scheduledFor || todayKey()}
              value={form.deadlineDate}
              onChange={(event) =>
                setForm({ ...form, deadlineDate: event.target.value })
              }
              className="input-field normal-case tracking-normal"
            />
            <span className="text-[11px] font-semibold normal-case tracking-normal text-gray-400">
              Final date by which task must be completed.
            </span>
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.14em] text-gray-500">
            Deadline time
            <input
              type="time"
              value={form.deadlineTime}
              onChange={(event) =>
                setForm({ ...form, deadlineTime: event.target.value })
              }
              className="input-field normal-case tracking-normal"
            />
            <span className="text-[11px] font-semibold normal-case tracking-normal text-gray-400">
              Example: 18:00 means 6:00 PM.
            </span>
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.14em] text-gray-500">
            Estimated time
            <input
              value={form.estimatedTime}
              onChange={(event) =>
                setForm({ ...form, estimatedTime: event.target.value })
              }
              className="input-field normal-case tracking-normal"
              placeholder="Example: 15m, 45m, 1h, 1h 30m"
            />
            <span className="text-[11px] font-semibold normal-case tracking-normal text-gray-400">
              How long this task should take.
            </span>
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.14em] text-gray-500">
            Reminder time
            <input
              type="time"
              value={form.reminderTime}
              onChange={(event) =>
                setForm({ ...form, reminderTime: event.target.value })
              }
              className="input-field normal-case tracking-normal"
              title="Reminder time"
            />
            <span className="text-[11px] font-semibold normal-case tracking-normal text-gray-400">
              Optional. Leave blank if no reminder is needed.
            </span>
          </label>
          <label className="grid gap-1 text-xs font-black uppercase tracking-[0.14em] text-gray-500">
            Reminder repeat
            <select
              value={form.reminderFrequency}
              onChange={(event) =>
                setForm({ ...form, reminderFrequency: event.target.value })
              }
              className="input-field normal-case tracking-normal"
            >
              <option value="OFF">No repeat reminder</option>
              <option value="DAILY">Every day until deadline</option>
              <option value="EVERY_2_DAYS">Every 2 days until deadline</option>
              <option value="TWICE_WEEKLY">Twice weekly until deadline</option>
              <option value="WEEKLY">Weekly until deadline</option>
            </select>
            <span className="text-[11px] font-semibold normal-case tracking-normal text-gray-400">
              Controls how often the employee gets reminded.
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">
            <input
              className="mt-1"
              type="checkbox"
              checked={form.addToTodo}
              onChange={(event) =>
                setForm({ ...form, addToTodo: event.target.checked })
              }
            />
            <span>
              Add to Todo
              <span className="block text-xs font-medium text-gray-400">
                Shows this task in the employee agent Todo list.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">
            <input
              className="mt-1"
              type="checkbox"
              checked={form.autoAddToEodOnComplete}
              onChange={(event) =>
                setForm({
                  ...form,
                  autoAddToEodOnComplete: event.target.checked,
                })
              }
            />
            <span>
              Add to EOD on complete
              <span className="block text-xs font-medium text-gray-400">
                When completed, it gets linked into Todo/EOD work proof.
              </span>
            </span>
          </label>
        </div>
        {createMut.isError && (
          <p className="mt-3 text-sm font-semibold text-red-600">
            Could not assign task. Check employee and deadline details.
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => createMut.mutate()}
            disabled={!canCreate || createMut.isPending}
            className="btn-primary inline-flex items-center gap-2"
          >
            {createMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Assign task
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        {["REQUESTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"].map((key) => (
          <div key={key} className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
              {key.replaceAll("_", " ")}
            </p>
            <p className="mt-1 text-3xl font-black text-gray-900">
              {counts[key] || 0}
            </p>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input-field pl-9"
              placeholder="Search task, employee, status…"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="input-field lg:w-48"
          >
            <option value="ALL">All status</option>
            <option value="REQUESTED">Requested</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="input-field lg:w-64"
          >
            <option value="ALL">All employees</option>
            {employees.map((employee) => (
              <option key={employee.employeeId} value={employee.employeeId}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Loading assigned tasks…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            No assigned tasks found.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((task) => (
              <div
                key={task.id || task._id}
                className="grid gap-4 p-4 lg:grid-cols-[1fr_180px_160px_220px]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-gray-900">
                      {task.title}
                    </h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusTone[task.status]}`}
                    >
                      {task.status.replaceAll("_", " ")}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                      {task.priority}
                    </span>
                  </div>
                  {task.description && (
                    <p className="mt-1 text-sm text-gray-600">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5" />
                      {task.assignedToName} ({task.assignedToEmployeeId})
                    </span>
                    <span>By {task.assignedByName}</span>
                    <span>{task.source}</span>
                  </div>
                </div>
                <div className="text-sm">
                  <p className="font-bold text-gray-900">{task.scheduledFor}</p>
                  <p className="text-xs text-gray-500">Scheduled</p>
                </div>
                <div className="text-sm">
                  <p className="font-bold text-gray-900">
                    {prettyDateTime(task.deadlineAt)}
                  </p>
                  <p className="text-xs text-gray-500">Deadline</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {!task.todoItemTaskId && (
                    <button
                      onClick={() =>
                        updateMut.mutate({
                          id: task.id || task._id || "",
                          patch: { addToTodoNow: true },
                        })
                      }
                      className="btn-ghost py-1.5 text-indigo-600"
                      disabled={updateMut.isPending}
                    >
                      <ClipboardList className="mr-1 inline h-3.5 w-3.5" />
                      Add Todo
                    </button>
                  )}
                  {task.status !== "COMPLETED" &&
                    task.status !== "CANCELLED" && (
                      <button
                        onClick={() =>
                          updateMut.mutate({
                            id: task.id || task._id || "",
                            patch: { status: "COMPLETED" },
                          })
                        }
                        className="btn-ghost py-1.5 text-emerald-700"
                        disabled={updateMut.isPending}
                      >
                        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                        Complete
                      </button>
                    )}
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    {task.estimatedTime || "No estimate"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
