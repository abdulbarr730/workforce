"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Coffee, Search } from "lucide-react";
import { api } from "@/lib/api";

type BreakSchedule = {
  _id: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  durationMinutes: number;
  fullDayAllowanceMinutes?: number;
  halfDayAllowanceMinutes?: number;
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

const dayLabel = (days: string[] = []) =>
  days.length ? days.map((day) => day.slice(0, 3)).join(", ") : "All days";

export default function BreakAssignmentsPage() {
  const [search, setSearch] = useState("");
  const { data: schedules = [], isLoading } = useQuery<BreakSchedule[]>({
    queryKey: ["break-schedules"],
    queryFn: () =>
      api.get("/api/daily-flow/break-schedules").then((r) => r.data.data),
  });

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, BreakSchedule[]>();
    schedules
      .filter((item) => {
        if (!q) return true;
        return [
          item.employeeName,
          item.employeeId,
          item.templateName,
          item.startTime,
          item.activeDays?.join(" "),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .sort((a, b) =>
        `${a.employeeName}-${a.startTime}`.localeCompare(
          `${b.employeeName}-${b.startTime}`,
        ),
      )
      .forEach((item) => {
        const key = `${item.employeeName} (${item.employeeId})`;
        map.set(key, [...(map.get(key) || []), item]);
      });
    return Array.from(map.entries());
  }, [schedules, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/dashboard/break-scheduler"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm ring-1 ring-slate-200"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Break Scheduler
          </Link>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
            <Coffee className="h-4 w-4" /> Assigned Breaks
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-950">
            Every employee break timing
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            One clean view of all employees, templates, allowances, and slot timings.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <span className="font-bold text-slate-950">{schedules.length}</span> slots configured
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
            <CalendarDays className="h-5 w-5 text-indigo-600" /> Assignment matrix
          </h2>
          <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 lg:w-96">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee, ID, template, day, time..."
              className="w-full border-0 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-sm text-slate-500">Loading assignments…</div>
        ) : grouped.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">No assignments found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {grouped.map(([employee, items]) => {
              const fullAllowance = Math.max(
                ...items.map((item) => Number(item.fullDayAllowanceMinutes || 45)),
              );
              const halfAllowance = Math.max(
                ...items.map((item) => Number(item.halfDayAllowanceMinutes || 20)),
              );
              const activeMinutes = items
                .filter((item) => item.isActive)
                .reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);

              return (
                <div key={employee} className="p-5">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="font-black text-slate-950">{employee}</h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Active planned slots: {activeMinutes} min · Full-day allowance: {fullAllowance} min · Half-day allowance: {halfAllowance} min
                      </p>
                    </div>
                    <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${activeMinutes > fullAllowance ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {activeMinutes > fullAllowance ? "Over allowance" : "Within allowance"}
                    </span>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Duration</th>
                          <th className="px-4 py-3">Template</th>
                          <th className="px-4 py-3">Days / Dates</th>
                          <th className="px-4 py-3">Reason rules</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((item) => (
                          <tr key={item._id}>
                            <td className="px-4 py-3 font-black text-indigo-700">{item.startTime}</td>
                            <td className="px-4 py-3 font-bold text-slate-900">{item.durationMinutes} min</td>
                            <td className="px-4 py-3 text-slate-600">{item.templateName || "—"}</td>
                            <td className="px-4 py-3 text-slate-600">
                              {item.specificDates?.length
                                ? item.specificDates.join(", ")
                                : `${dayLabel(item.activeDays)}${item.startDate || item.endDate ? ` · ${item.startDate || "Any"} → ${item.endDate || "No end"}` : ""}`}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {item.reasonOptions?.length ? item.reasonOptions.join(", ") : "—"}
                              {item.requireReasonOnReturn ? " · required" : ""}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-black ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                                {item.isActive ? "Active" : "Paused"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}