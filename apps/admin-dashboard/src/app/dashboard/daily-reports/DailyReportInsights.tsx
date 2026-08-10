"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { api } from "@/lib/api";
import { RecentEdits } from "../RecentEdits";

type ReportEmployee = {
  employeeId: string;
  name: string;
};

type AttentionEmployee = {
  employeeId: string;
  unproductiveSeconds: number;
};

function ProductivityAlerts({
  date,
  employees,
}: {
  date: string;
  employees: ReportEmployee[];
}) {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["team-analytics", date],
    queryFn: () =>
      api
        .get(`/api/analytics/team?date=${date}`)
        .then((response) => response.data.data),
    staleTime: 30_000,
  });

  const needsAttention: AttentionEmployee[] = analytics?.needsAttention || [];
  const names = new Map(
    employees.map((employee) => [employee.employeeId, employee.name]),
  );

  if (isLoading) {
    return (
      <div className="h-36 animate-pulse rounded-2xl border border-red-100 bg-red-50" />
    );
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-red-100 p-2 text-red-600">
          <Activity className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-red-800">
            Productivity Alerts
          </h2>
          <p className="mb-3 mt-1 text-xs text-red-600">
            Employees with more than 30 minutes of unproductive time on the
            selected report date.
          </p>
          {needsAttention.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {needsAttention.map((employee) => (
                <Link
                  href={`/dashboard/analytics?employeeId=${employee.employeeId}&date=${date}`}
                  key={employee.employeeId}
                  className="flex items-center gap-2 rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm transition-all hover:shadow"
                >
                  {names.get(employee.employeeId) || employee.employeeId}
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                    {(employee.unproductiveSeconds / 60).toFixed(0)} mins
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-emerald-100 bg-white/80 px-3 py-2 text-xs font-medium text-emerald-700">
              No productivity alerts for this date.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function DailyReportInsights({
  date,
  employees,
}: {
  date: string;
  employees: ReportEmployee[];
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-bold text-gray-900">
          Daily report insights
        </h2>
        <p className="text-xs text-gray-500">
          Productivity exceptions and employee changes relevant to EOD and Todo
          review.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ProductivityAlerts date={date} employees={employees} />
        <RecentEdits />
      </div>
    </section>
  );
}
