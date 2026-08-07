import {
  formatEodDuration,
  formatEodTotalMinutes,
  getEodTotalMinutes,
  normalizeEodTopTasks,
  normalizeEodTasks,
  type EodReportData,
} from "@workforce/shared-types";
import { CheckCircle2, Clock3, Hash, Star } from "lucide-react";

export function EodReportDetails({
  report,
  compact = false,
}: {
  report: EodReportData;
  compact?: boolean;
}) {
  const tasks = normalizeEodTasks(report);
  const totalMinutes = getEodTotalMinutes(report);
  const hasCounts = tasks.some((task) => task.count || task.callCount);
  const topTasks = normalizeEodTopTasks(report);
  const summary = String(report.summary || "").trim();

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {summary ? (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Summary
          </p>
          <div className="rounded-xl border border-slate-200 border-l-4 border-l-indigo-500 bg-slate-50 px-4 py-3 text-sm font-medium leading-relaxed text-slate-700">
            {summary}
          </div>
        </div>
      ) : null}

      {topTasks.length > 0 ? (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
            Top Tasks
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {topTasks.map((task, index) => (
              <div
                key={`${task}-${index}`}
                className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm font-semibold text-slate-800"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500 text-[10px] font-extrabold text-white">
                  {index + 1}
                </span>
                <span className="break-words">{task}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Completed Work
          </p>
          {totalMinutes > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
              <Clock3 className="h-3.5 w-3.5" />
              Total: {formatEodTotalMinutes(totalMinutes)}
            </span>
          ) : null}
        </div>

        {tasks.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-44 px-3 py-2.5 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Time Stamp
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Task
                  </th>
                  {hasCounts ? (
                    <th className="w-24 px-3 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Count
                    </th>
                  ) : null}
                  <th className="w-24 px-3 py-2.5 text-right text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task, index) =>
                  task.isSectionHeader ? (
                    <tr key={`header-${index}`} className="bg-slate-50/70">
                      <td
                        colSpan={hasCounts ? 4 : 3}
                        className="border-l-4 border-l-indigo-500 px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        {task.text}
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={`${task.text}-${task.interval}-${index}`}
                      className="align-top hover:bg-indigo-50/30"
                    >
                      <td className="whitespace-nowrap px-3 py-3">
                        {task.interval ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 font-mono text-[11px] font-bold text-indigo-700">
                            <Clock3 className="h-3 w-3" />
                            {task.interval}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">
                            Not provided
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-800">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          <div className="min-w-0">
                            <span className="break-words font-semibold">
                              {task.text}
                            </span>
                            {task.isTopTask ? (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                <Star className="h-2.5 w-2.5 fill-amber-400" />
                                Top
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      {hasCounts ? (
                        <td className="px-3 py-3 text-center">
                          {task.count || task.callCount ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                              <Hash className="h-3 w-3" />
                              {task.count || task.callCount}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-extrabold text-slate-700">
                          {formatEodDuration(task.duration)}
                        </span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
            No completed tasks were included in this EOD.
          </div>
        )}
      </div>
    </div>
  );
}
