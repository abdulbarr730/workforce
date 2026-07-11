import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

function fmtSecs(s: number) {
  if (!s) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m ${secs}s`;
  if (m > 0) return `${m}m ${secs}s`;
  return `${secs}s`;
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

  return (
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
                className="bg-white border border-red-100 p-4 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md cursor-pointer transition-all hover:border-red-300"
              >
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800">
                    {getUserName(emp.employeeId)}
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
                    {(emp.unproductiveSeconds / 60).toFixed(0)}m Unproductive
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
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Performing
          Well
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
                className="bg-white border border-emerald-100 p-4 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md cursor-pointer transition-all hover:border-emerald-300"
              >
                <div>
                  <h3 className="font-bold text-slate-800">
                    {getUserName(emp.employeeId)}
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
  );
}
