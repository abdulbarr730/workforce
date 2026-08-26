"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type HolidayType = "NATIONAL" | "COMPANY" | "DEPARTMENT" | "EMERGENCY";

interface Holiday {
  _id: string;
  name: string;
  date: string;
  type: HolidayType;
  paid: boolean;
  isActive: boolean;
  workingEmployeeIds: string[];
}

interface Employee {
  _id: string;
  employeeId: string;
  name: string;
  departmentName?: string;
  role: string;
  isActive: boolean;
}

const HOLIDAY_TYPES: HolidayType[] = [
  "NATIONAL",
  "COMPANY",
  "DEPARTMENT",
  "EMERGENCY",
];

const emptyForm = {
  _id: "",
  name: "",
  date: "",
  type: "NATIONAL" as HolidayType,
  paid: true,
  isActive: true,
  workingEmployeeIds: [] as string[],
};

export default function HolidaysPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [error, setError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );

  const holidaysQuery = useQuery({
    queryKey: ["holidays"],
    queryFn: () =>
      api.get("/api/attendance/time-off/holidays").then((r) => r.data.data),
  });
  const employeesQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const refreshHolidayData = () => {
    qc.invalidateQueries({ queryKey: ["holidays"] });
    qc.invalidateQueries({ queryKey: ["attendance"] });
    setShowForm(false);
    setForm(emptyForm);
    setEmployeeSearch("");
    setError("");
  };

  const saveHoliday = useMutation({
    mutationFn: () => {
      const { _id, ...payload } = form;
      return _id
        ? api.patch(`/api/attendance/time-off/holidays/${_id}`, payload)
        : api.post("/api/attendance/time-off/holidays", payload);
    },
    onSuccess: refreshHolidayData,
    onError: (requestError: any) =>
      setError(
        requestError?.response?.data?.message ||
          requestError?.response?.data?.error ||
          "Could not save the holiday.",
      ),
  });

  const deleteHoliday = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/attendance/time-off/holidays/${id}`),
    onSuccess: refreshHolidayData,
  });

  const holidays: Holiday[] = Array.isArray(holidaysQuery.data)
    ? holidaysQuery.data
    : [];
  const rawEmployees = Array.isArray(employeesQuery.data)
    ? employeesQuery.data
    : employeesQuery.data?.users || [];
  const employees: Employee[] = rawEmployees.filter(
    (employee: Employee) =>
      employee.isActive &&
      employee.role !== "ADMIN" &&
      employee.role !== "SUPER_ADMIN",
  );
  const employeeById = new Map(
    employees.map((employee) => [employee.employeeId, employee]),
  );
  const visibleEmployees = employees.filter((employee) => {
    const search = employeeSearch.trim().toLowerCase();
    return (
      !search ||
      employee.name.toLowerCase().includes(search) ||
      employee.employeeId.toLowerCase().includes(search) ||
      employee.departmentName?.toLowerCase().includes(search)
    );
  });

  const openHoliday = (holiday?: Holiday) => {
    setForm(
      holiday
        ? {
            _id: holiday._id,
            name: holiday.name,
            date: holiday.date,
            type: holiday.type || "COMPANY",
            paid: holiday.paid,
            isActive: holiday.isActive !== false,
            workingEmployeeIds: holiday.workingEmployeeIds || [],
          }
        : emptyForm,
    );
    setEmployeeSearch("");
    setError("");
    setShowForm(true);
  };

  const toggleWorkingEmployee = (employeeId: string) => {
    setForm((current) => ({
      ...current,
      workingEmployeeIds: current.workingEmployeeIds.includes(employeeId)
        ? current.workingEmployeeIds.filter((id) => id !== employeeId)
        : [...current.workingEmployeeIds, employeeId],
    }));
  };

  const holidaysByDate = new Map(
    holidays
      .filter((holiday) => holiday.isActive !== false)
      .map((holiday) => [holiday.date, holiday]),
  );
  const [calendarYear, calendarMonthNumber] = calendarMonth
    .split("-")
    .map(Number);
  const firstDay = new Date(calendarYear, calendarMonthNumber - 1, 1);
  const daysInMonth = new Date(calendarYear, calendarMonthNumber, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const calendarCells = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      return `${calendarYear}-${String(calendarMonthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Holidays</h1>
          <p className="mt-1 text-sm text-gray-500">
            Holidays apply to everyone unless specific employees are selected to
            work.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openHoliday()}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" /> Add holiday
        </button>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Holiday calendar
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              If a configured holiday exists, attendance will show the holiday name first. Employee exceptions still follow normal shift rules.
            </p>
          </div>
          <input
            type="month"
            value={calendarMonth}
            onChange={(event) => setCalendarMonth(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold text-gray-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {calendarCells.map((date, index) => {
            const holiday = date ? holidaysByDate.get(date) : null;
            const dayNumber = date ? Number(date.slice(-2)) : "";
            return (
              <button
                key={date || `blank-${index}`}
                type="button"
                disabled={!date}
                onClick={() => {
                  if (holiday) openHoliday(holiday);
                  else if (date) {
                    setForm({ ...emptyForm, date });
                    setEmployeeSearch("");
                    setError("");
                    setShowForm(true);
                  }
                }}
                className={`min-h-24 rounded-xl border p-2 text-left transition ${
                  !date
                    ? "border-transparent bg-transparent"
                    : holiday
                      ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
                      : "border-gray-100 bg-gray-50 hover:border-gray-300 hover:bg-white"
                }`}
              >
                {date ? (
                  <>
                    <span className="text-xs font-semibold text-gray-700">
                      {dayNumber}
                    </span>
                    {holiday ? (
                      <div className="mt-2">
                        <p className="line-clamp-2 text-xs font-bold text-amber-900">
                          {holiday.name}
                        </p>
                        <p className="mt-1 text-[10px] text-amber-700">
                          {(holiday.workingEmployeeIds || []).length
                            ? `${holiday.workingEmployeeIds.length} working exception(s)`
                            : "Holiday for everyone"}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {holidaysQuery.isLoading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
        ) : holidays.length === 0 ? (
          <div className="flex flex-col items-center p-12 text-center">
            <Calendar className="mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-400">No holidays added yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-gray-100 bg-gray-50/70">
                <tr>
                  {[
                    "Holiday",
                    "Date",
                    "Type",
                    "Payment",
                    "Working exceptions",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holidays
                  .toSorted((a, b) => a.date.localeCompare(b.date))
                  .map((holiday) => {
                    const exceptions = (holiday.workingEmployeeIds || [])
                      .map((id) => employeeById.get(id)?.name || id)
                      .filter(Boolean);
                    return (
                      <tr key={holiday._id} className="border-b border-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {holiday.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(holiday.date)}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-blue-700">
                          {holiday.type || "COMPANY"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {holiday.paid ? "Paid" : "Unpaid"}
                        </td>
                        <td className="max-w-sm px-4 py-3 text-sm text-gray-600">
                          {exceptions.length > 0
                            ? `${exceptions.slice(0, 3).join(", ")}${exceptions.length > 3 ? ` +${exceptions.length - 3}` : ""}`
                            : "Nobody — holiday for everyone"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openHoliday(holiday)}
                              className="rounded-md p-2 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600"
                              aria-label={`Edit ${holiday.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Delete ${holiday.name}?`)) {
                                  deleteHoliday.mutate(holiday._id);
                                }
                              }}
                              className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              aria-label={`Delete ${holiday.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {form._id ? "Edit holiday" : "Add holiday"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Everyone is off by default. Select only the people who will
                  work.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveHoliday.mutate();
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="space-y-5 overflow-y-auto p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-700">
                    Holiday name
                    <input
                      required
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="e.g. Independence Day"
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Date
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          date: event.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-700">
                    Type
                    <select
                      value={form.type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          type: event.target.value as HolidayType,
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      {HOLIDAY_TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.paid}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          paid: event.target.checked,
                        }))
                      }
                    />
                    Paid holiday
                  </label>
                </div>

                <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        Employees working on this holiday
                      </h3>
                      <p className="text-xs text-gray-500">
                        {form.workingEmployeeIds.length} selected; normal
                        attendance rules apply to them.
                      </p>
                    </div>
                    <input
                      value={employeeSearch}
                      onChange={(event) =>
                        setEmployeeSearch(event.target.value)
                      }
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      placeholder="Search employees…"
                    />
                  </div>
                  <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                    {visibleEmployees.map((employee) => (
                      <label
                        key={employee.employeeId}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 hover:border-amber-300"
                      >
                        <input
                          type="checkbox"
                          checked={form.workingEmployeeIds.includes(
                            employee.employeeId,
                          )}
                          onChange={() =>
                            toggleWorkingEmployee(employee.employeeId)
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900">
                            {employee.name}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {employee.employeeId} ·{" "}
                            {employee.departmentName || employee.role}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>

              <div className="flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveHoliday.isPending}
                  className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-50"
                >
                  {saveHoliday.isPending ? "Saving…" : "Save holiday"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
