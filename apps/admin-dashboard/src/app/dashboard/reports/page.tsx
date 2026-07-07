"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BarChart2, CheckCircle2, FileText, Download } from "lucide-react";

export default function ReportsPage() {
  const [viewMode, setViewMode] = useState<"weekly" | "monthly">("weekly");
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const d = new Date();
    const w = Math.ceil((((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7);
    return `${d.getFullYear()}-W${w.toString().padStart(2, '0')}`;
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedEmployee, setSelectedEmployee] = useState("");

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const urlParams = new URLSearchParams();
  if (selectedEmployee) urlParams.set("employeeId", selectedEmployee);
  if (viewMode === "weekly") urlParams.set("week", selectedWeek);
  else urlParams.set("month", selectedMonth);
  const qStr = urlParams.toString();

  const { data: attendance } = useQuery({
    queryKey: ["reports-attendance", qStr],
    queryFn: () => api.get(`/api/attendance/records?${qStr}`).then(r => r.data.data)
  });

  const { data: eods } = useQuery({
    queryKey: ["reports-eod", qStr],
    queryFn: () => api.get(`/api/daily-flow/eod?${qStr}`).then(r => r.data.data)
  });

  const { data: todos } = useQuery({
    queryKey: ["reports-todo", qStr],
    queryFn: () => api.get(`/api/daily-flow/todos?${qStr}`).then(r => r.data.data)
  });

  const stats = useMemo(() => {
    let totalProd = 0;
    let totalNonProd = 0;
    let lateDays = 0;
    let otMins = 0;
    let presentDays = 0;

    (attendance || []).forEach((r: any) => {
      totalProd += r.productiveMinutes || 0;
      totalNonProd += (r.breakMinutes || 0) + (r.idleMinutes || 0);
      otMins += r.overtimeMinutes || 0;
      if (r.attendanceStatus === "LATE") lateDays++;
      if (["PRESENT", "LATE", "HALF_DAY"].includes(r.attendanceStatus)) presentDays++;
    });

    return { totalProd, totalNonProd, lateDays, otMins, presentDays };
  }, [attendance]);

  const combinedEods = useMemo(() => {
    const list = [...(eods || [])];
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [eods]);

  const handleExport = () => {
    const url = new URL(window.location.origin + "/api/analytics/export");
    url.searchParams.set("token", localStorage.getItem("token") || "");
    if (selectedEmployee) url.searchParams.set("employeeId", selectedEmployee);
    if (viewMode === "weekly") url.searchParams.set("week", selectedWeek);
    else url.searchParams.set("month", selectedMonth);
    window.open(url.toString(), "_blank");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-indigo-600" />
            Central Reports
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Comprehensive Weekly & Monthly Analytics per Employee
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setViewMode("weekly")} className={`px-4 py-1.5 text-sm font-medium rounded-md ${viewMode === "weekly" ? "bg-white shadow-sm" : "text-gray-500"}`}>Weekly</button>
            <button onClick={() => setViewMode("monthly")} className={`px-4 py-1.5 text-sm font-medium rounded-md ${viewMode === "monthly" ? "bg-white shadow-sm" : "text-gray-500"}`}>Monthly</button>
          </div>
          <button onClick={handleExport} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow hover:bg-slate-800">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="flex gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm items-center">
        <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 min-w-[200px]">
          <option value="">-- All Employees --</option>
          {users?.filter((u: any) => u.role !== "SUPER_ADMIN" && u.role !== "ADMIN").map((u: any) => (
            <option key={u.employeeId} value={u.employeeId}>{u.name} ({u.employeeId})</option>
          ))}
        </select>

        {viewMode === "weekly" ? (
          <input type="week" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" />
        ) : (
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Productive Time</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{Math.floor(stats.totalProd / 60)}h {stats.totalProd % 60}m</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Non-Productive (Breaks/Idle)</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{Math.floor(stats.totalNonProd / 60)}h {stats.totalNonProd % 60}m</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Overtime</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{Math.floor(stats.otMins / 60)}h {stats.otMins % 60}m</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Days Present / Late</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.presentDays} / <span className="text-amber-500">{stats.lateDays}</span></p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            EOD & Todo History
          </h2>
        </div>
        <div className="p-6">
          {combinedEods.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No EODs found for this period.</div>
          ) : (
            <div className="space-y-6">
              {combinedEods.map((eod: any) => {
                const todo = todos?.find((t: any) => t.date === eod.date && t.employeeId === eod.employeeId);
                const emp = users?.find((u: any) => u.employeeId === eod.employeeId);
                
                return (
                  <div key={eod._id} className="p-5 border border-gray-100 rounded-xl bg-gray-50/50">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900">{eod.date}</h3>
                        <p className="text-sm text-gray-500">{emp?.name || eod.employeeId} - {eod.hoursWorked ? `${eod.hoursWorked}h tracked` : "No hours specified"}</p>
                      </div>
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">EOD Submitted</span>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 mb-1">Summary</h4>
                        <p className="text-sm text-gray-700">{eod.summary}</p>
                      </div>
                      
                      {eod.completedItems && eod.completedItems.length > 0 && (
                        <div>
                          <h4 className="text-sm font-bold text-gray-900 mb-2">Completed Tasks</h4>
                          <div className="space-y-2">
                            {eod.completedItems.map((item: string, i: number) => {
                              try {
                                const p = JSON.parse(item);
                                return (
                                  <div key={i} className="flex items-center gap-2 text-sm text-gray-600 bg-white p-2 rounded border border-gray-100">
                                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                    <span>{p.text}</span>
                                  </div>
                                );
                              } catch(e) {
                                return (
                                  <div key={i} className="flex items-center gap-2 text-sm text-gray-600 bg-white p-2 rounded border border-gray-100">
                                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                    <span>{item}</span>
                                  </div>
                                );
                              }
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
