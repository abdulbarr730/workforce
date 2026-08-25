"use client";

import { RecentEdits } from "../RecentEdits";

type ReportEmployee = {
  employeeId: string;
  name: string;
};

export function DailyReportInsights({
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
          Latest employee change relevant to EOD and Todo review.
        </p>
      </div>
      <div className="max-w-3xl">
        <RecentEdits limit={1} preferUnread showHistoryToggle />
      </div>
    </section>
  );
}
