import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EodReportDetails } from "@/components/daily-flow/EodReportDetails";
import { getEodTotalMinutes } from "@workforce/shared-types";
import { Clock, ChevronDown } from "lucide-react";

function fmtSecs(s: number) {
  if (!s) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m ${secs}s`;
  if (m > 0) return `${m}m ${secs}s`;
  return `${secs}s`;
}

function calculateTotalEodHours(eod: any): number {
  return Number((getEodTotalMinutes(eod) / 60).toFixed(2));
}

export function TeamOverview({
  dateInput,
  users,
  onSelectEmployee,
}: {
  dateInput: string;
  users: any;
  onSelectEmployee: (id: string) => void;
}) {
  const [threshold, setThreshold] = useState(30);
  const [tempThreshold, setTempThreshold] = useState(30);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  const { data: teamAnalytics, isLoading } = useQuery({
    queryKey: ["team-analytics", dateInput, threshold],
    queryFn: () =>
      api
        .get(`/api/analytics/team?date=${dateInput}&threshold=${threshold}`)
        .then((r) => r.data.data),
  });

  const getUserName = (id: string) => {
    const allUsers = Array.isArray(users) ? users : (users?.users ?? []);
    const user = allUsers.find((u: any) => u.employeeId === id);
    return user ? user.name : id;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm">
        <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin shadow-md"></div>
        <p className="mt-6 text-sm font-bold text-slate-600 uppercase tracking-widest animate-pulse">
          Loading Overview...
        </p>
      </div>
    );
  }

  const needsAttention = teamAnalytics?.needsAttention || [];
  const doingWell = teamAnalytics?.topEmployees || [];
  const teamTodos = teamAnalytics?.teamTodos || [];
  const teamEods = teamAnalytics?.teamEods || [];

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Needs Attention Section (Red) */}
          <div className="bg-red-50/50 border border-red-200/60 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-red-800 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500"></div> Needs
                Attention
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-red-700 font-medium">&gt;</span>
                <input
                  type="number"
                  value={tempThreshold}
                  onChange={(e) => setTempThreshold(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-center rounded-lg border border-red-200 bg-white text-red-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                  min="1"
                />
                <span className="text-red-700 font-medium">mins</span>
                <button
                  onClick={() => setThreshold(tempThreshold)}
                  className="ml-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
            <p className="text-xs text-red-600 mb-4 font-medium">
              Employees with excessive unproductive time
            </p>

            {needsAttention.length === 0 ? (
              <div className="text-center py-10 bg-white/50 rounded-2xl border border-red-100">
                <span className="text-red-400 font-medium text-sm">
                  Everyone is highly productive today!
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {needsAttention.map((emp: any) => (
                  <div
                    key={emp.employeeId}
                    onClick={() => onSelectEmployee(emp.employeeId)}
                    className="bg-white border border-red-100 p-4 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md cursor-pointer transition-all hover:border-red-300 group"
                  >
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-800 group-hover:text-red-600 transition-colors flex items-center gap-2">
                        {getUserName(emp.employeeId)}
                        <span className="text-[10px] text-slate-400 font-normal">
                          → View Telemetry
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        Productive: {fmtSecs(emp.productiveSeconds)}
                      </p>

                      {emp.topApps && emp.topApps.length > 0 && (
                        <div className="mt-2 text-[10px] flex flex-wrap gap-1">
                          {emp.topApps.slice(0, 3).map((app: any) => (
                            <span
                              key={app.app}
                              className="bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded"
                            >
                              {app.app} ({fmtSecs(app.seconds)})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="bg-red-100 text-red-700 font-bold px-2 py-1 rounded-lg text-xs">
                        {(emp.unproductiveSeconds / 60).toFixed(0)}m
                        Unproductive
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Doing Well Section (Green) */}
          <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-3xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-emerald-800 mb-6 uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>{" "}
              Performing Well
            </h2>
            <p className="text-xs text-emerald-600 mb-4 font-medium">
              Top employees with highest focus scores
            </p>

            {doingWell.length === 0 ? (
              <div className="text-center py-10 bg-white/50 rounded-2xl border border-emerald-100">
                <span className="text-emerald-400 font-medium text-sm">
                  No data available yet
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {doingWell.map((emp: any) => (
                  <div
                    key={emp.employeeId}
                    onClick={() => onSelectEmployee(emp.employeeId)}
                    className="bg-white border border-emerald-100 p-4 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md cursor-pointer transition-all hover:border-emerald-300 group"
                  >
                    <div>
                      <h3 className="font-bold text-slate-800 group-hover:text-emerald-600 transition-colors flex items-center gap-2">
                        {getUserName(emp.employeeId)}
                        <span className="text-[10px] text-slate-400 font-normal">
                          → View Telemetry
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        Productive: {fmtSecs(emp.productiveSeconds)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-lg text-xs">
                        Focus Score: {emp.focusScore}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Todos & EODs Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Team Todos */}
          <div className="bg-blue-50/50 border border-blue-200/60 rounded-3xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-blue-800 mb-6 uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div> Team
              Todos
            </h2>

            {teamTodos.length === 0 ? (
              <div className="text-center py-10 bg-white/50 rounded-2xl border border-blue-100">
                <span className="text-blue-400 font-medium text-sm">
                  No todos submitted for this date
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {teamTodos.map((todo: any) => (
                  <details
                    key={todo._id}
                    className="bg-white border border-blue-100 rounded-2xl shadow-sm group"
                  >
                    <summary className="font-bold text-slate-800 p-4 cursor-pointer marker:text-blue-500 hover:bg-blue-50/30 rounded-2xl transition-colors">
                      {getUserName(todo.employeeId)}
                    </summary>
                    <div className="px-4 pb-4 border-t border-blue-50 mt-1 pt-3">
                      <ul className="space-y-1">
                        {todo.items.map((item: any, idx: number) => (
                          <li
                            key={idx}
                            className="text-sm text-slate-600 flex items-start gap-2"
                          >
                            <span className="mt-1">
                              {item.done ? "✅" : "🔲"}
                            </span>
                            <span
                              className={
                                item.done ? "line-through opacity-70" : ""
                              }
                            >
                              {item.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>

          {/* Team EODs */}
          <div className="bg-purple-50/50 border border-purple-200/60 rounded-3xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-purple-800 mb-6 uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500"></div> Team
              EODs
            </h2>

            {teamEods.length === 0 ? (
              <div className="text-center py-10 bg-white/50 rounded-2xl border border-purple-100">
                <span className="text-purple-400 font-medium text-sm">
                  No EODs submitted for this date
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {teamEods.map((eod: any) => (
                  <details
                    key={eod._id}
                    className="bg-white border border-purple-100/60 rounded-2xl shadow-sm group overflow-hidden transition-all duration-300 hover:shadow-md hover:border-purple-200"
                  >
                    <summary className="font-bold text-slate-800 p-5 cursor-pointer list-none flex items-center justify-between bg-gradient-to-r hover:from-purple-50/50 hover:to-transparent transition-all select-none">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 shadow-sm border border-purple-200">
                          {getUserName(eod.employeeId).charAt(0)}
                        </div>
                        <div>
                          <div className="text-base text-slate-800">
                            {getUserName(eod.employeeId)}
                          </div>
                          <div className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Submitted EOD
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {calculateTotalEodHours(eod) > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">
                            <Clock className="w-3.5 h-3.5" />
                            {calculateTotalEodHours(eod)} Hours
                          </span>
                        )}
                        <ChevronDown className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform duration-300" />
                      </div>
                    </summary>

                    <div className="px-5 pb-5 pt-2 border-t border-purple-50/50">
                      <div className="mt-4">
                        <EodReportDetails report={eod} compact />
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedEmpId &&
        (() => {
          const allAnalytics = [...needsAttention, ...doingWell];
          const empData = allAnalytics.find(
            (e) => e.employeeId === selectedEmpId,
          );
          if (!empData) return null;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                      {getUserName(selectedEmpId).charAt(0)}
                    </div>
                    Detailed Telemetry for {getUserName(selectedEmpId)}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const id = selectedEmpId;
                        setSelectedEmpId(null);
                        if (id) onSelectEmployee(id);
                      }}
                      className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl transition-colors shadow-sm"
                    >
                      Full Analytics Suite →
                    </button>
                    <button
                      onClick={() => setSelectedEmpId(null)}
                      className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="p-6 overflow-y-auto">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Focus Score
                      </div>
                      <div className="text-2xl font-black text-slate-700">
                        {empData.focusScore}%
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                      <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">
                        Productive
                      </div>
                      <div className="text-lg font-bold text-emerald-700">
                        {fmtSecs(empData.productiveSeconds)}
                      </div>
                    </div>
                    <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                      <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">
                        Unproductive
                      </div>
                      <div className="text-lg font-bold text-red-700">
                        {fmtSecs(empData.unproductiveSeconds)}
                      </div>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                      <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">
                        Idle
                      </div>
                      <div className="text-lg font-bold text-amber-700">
                        {fmtSecs(empData.idleSeconds)}
                      </div>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-4">
                    Top Applications Used
                  </h3>
                  <div className="space-y-2">
                    {empData.topApps?.map((app: any) => {
                      const percentage = Math.min(
                        100,
                        Math.round(
                          (app.seconds / (empData.totalTrackedSeconds || 1)) *
                            100,
                        ),
                      );
                      return (
                        <div
                          key={app.app}
                          className="bg-white border border-slate-100 rounded-xl p-3 flex items-center gap-4"
                        >
                          <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-lg shadow-sm border border-slate-100 shrink-0">
                            🖥️
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-semibold text-slate-700 truncate">
                                {app.app}
                              </span>
                              <span className="font-bold text-indigo-600">
                                {fmtSecs(app.seconds)}
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-indigo-400 h-1.5 rounded-full"
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}
