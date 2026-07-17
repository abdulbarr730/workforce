"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  LineChart,
  Download,
  Settings2,
  CheckSquare,
  Square,
  FileSpreadsheet,
  CalendarDays,
  UserCircle2
} from "lucide-react";

export default function ReportsDashboardPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedEmployee, setSelectedEmployee] = useState("");

  // Report Builder State
  const [includeAttendance, setIncludeAttendance] = useState(true);
  const [includeProductive, setIncludeProductive] = useState(true);
  const [topProductiveLimit, setTopProductiveLimit] = useState(10);
  const [includeUnproductive, setIncludeUnproductive] = useState(true);
  const [topUnproductiveLimit, setTopUnproductiveLimit] = useState(10);
  const [includeShifts, setIncludeShifts] = useState(true);
  const [includeNeedsAttention, setIncludeNeedsAttention] = useState(true);

  const [isDownloading, setIsDownloading] = useState(false);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const handleDownloadExcel = async () => {
    try {
      setIsDownloading(true);
      const payload = {
        startDate,
        endDate,
        employeeId: selectedEmployee || "ALL",
        includeAttendance,
        topProductiveLimit: includeProductive ? topProductiveLimit : 0,
        topUnproductiveLimit: includeUnproductive ? topUnproductiveLimit : 0,
        includeShifts,
        includeNeedsAttention,
      };

      const response = await api.post("/api/analytics/custom-report", payload, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Custom_Report_${startDate}_to_${endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      console.error("Failed to download report", error);
      alert("Failed to generate report. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-10 space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative">
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <LineChart className="w-7 h-7 text-indigo-600" />
            Custom Report Builder
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            Build and export a highly actionable, auto-formatted Excel report tailored to your exact needs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Builder Settings */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-gray-400" />
              Report Configuration
            </h2>

            <div className="space-y-4">
              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date Range</label>
                <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1 px-3 py-2 bg-transparent text-sm font-medium outline-none"
                  />
                  <span className="text-gray-400 font-bold">→</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 px-3 py-2 bg-transparent text-sm font-medium outline-none"
                  />
                </div>
              </div>

              {/* Employee Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Filter by Employee</label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="">All Employees</option>
                  {users
                    ?.filter((u: any) => u.role !== "SUPER_ADMIN" && u.role !== "ADMIN")
                    .map((u: any) => (
                      <option key={u.employeeId} value={u.employeeId}>
                        {u.name} ({u.employeeId})
                      </option>
                    ))}
                </select>
              </div>

              <hr className="border-gray-100 my-4" />

              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Include Modules</label>
              
              {/* Checkboxes */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div onClick={() => setIncludeAttendance(!includeAttendance)}>
                    {includeAttendance ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />}
                  </div>
                  <span className="text-sm font-semibold text-gray-700">Attendance & Login/Logout Timings</span>
                </label>

                <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="flex items-center gap-3" onClick={() => setIncludeProductive(!includeProductive)}>
                      {includeProductive ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />}
                      <span className="text-sm font-semibold text-gray-700">Top Productive Apps</span>
                    </div>
                    {includeProductive && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Up to:</span>
                        <input type="number" min="1" max="50" value={topProductiveLimit} onChange={e => setTopProductiveLimit(Number(e.target.value))} className="w-16 px-2 py-1 text-sm border border-gray-200 rounded-md outline-none focus:border-indigo-500" />
                      </div>
                    )}
                  </label>
                </div>

                <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="flex items-center gap-3" onClick={() => setIncludeUnproductive(!includeUnproductive)}>
                      {includeUnproductive ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />}
                      <span className="text-sm font-semibold text-gray-700">Top Unproductive Apps</span>
                    </div>
                    {includeUnproductive && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Up to:</span>
                        <input type="number" min="1" max="50" value={topUnproductiveLimit} onChange={e => setTopUnproductiveLimit(Number(e.target.value))} className="w-16 px-2 py-1 text-sm border border-gray-200 rounded-md outline-none focus:border-indigo-500" />
                      </div>
                    )}
                  </label>
                </div>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div onClick={() => setIncludeShifts(!includeShifts)}>
                    {includeShifts ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-700 block">Shifts & Weekend Activity</span>
                    <span className="text-xs text-gray-500">Includes day of week to easily spot Sunday workers.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div onClick={() => setIncludeNeedsAttention(!includeNeedsAttention)}>
                    {includeNeedsAttention ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />}
                  </div>
                  <span className="text-sm font-semibold text-gray-700">Needs Attention (Late, Missed EODs)</span>
                </label>
              </div>

              <div className="pt-6">
                <button
                  onClick={handleDownloadExcel}
                  disabled={isDownloading}
                  className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-3.5 rounded-xl text-sm font-bold shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isDownloading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <FileSpreadsheet className="w-5 h-5" /> Generate Excel Report
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* Right Column: Preview / Explainer */}
        <div className="lg:col-span-2">
          <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm h-full flex flex-col items-center justify-center text-center">
             <div className="w-24 h-24 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-6">
               <FileSpreadsheet className="w-12 h-12" />
             </div>
             <h2 className="text-2xl font-black text-gray-900 mb-2">Smart Actionable Reports</h2>
             <p className="text-gray-500 max-w-md mx-auto mb-8 font-medium">
               Select your desired modules on the left and click Generate. The system will compile a deeply comprehensive Excel file (.xlsx) containing separate sheets for every selected module. 
               <br/><br/>
               Columns will automatically resize themselves perfectly to fit the data so it's ready to present instantly!
             </p>

             <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col items-center">
                  <CalendarDays className="w-6 h-6 text-emerald-500 mb-2" />
                  <span className="text-sm font-bold text-gray-700">Captures Weekends</span>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col items-center">
                  <UserCircle2 className="w-6 h-6 text-blue-500 mb-2" />
                  <span className="text-sm font-bold text-gray-700">Login/Logout Times</span>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
