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
  UserCircle2,
  Sparkles,
  BarChart2
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

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
  const [isGeneratingVisual, setIsGeneratingVisual] = useState(false);
  const [visualReport, setVisualReport] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const getPayload = () => ({
    startDate,
    endDate,
    employeeId: selectedEmployee || "ALL",
    includeAttendance,
    topProductiveLimit: includeProductive ? topProductiveLimit : 0,
    topUnproductiveLimit: includeUnproductive ? topUnproductiveLimit : 0,
    includeShifts,
    includeNeedsAttention,
  });

  const handleDownloadExcel = async () => {
    try {
      setIsDownloading(true);
      const response = await api.post("/api/analytics/custom-report", getPayload(), {
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

  const handleGenerateVisualReport = async () => {
    try {
      setIsGeneratingVisual(true);
      setVisualReport(null);
      setAiSummary(null);
      
      const res = await api.post("/api/analytics/visual-report", getPayload());
      const data = res.data.data;
      setVisualReport(data);

      // Trigger AI Analysis
      try {
        const aiRes = await api.post("/api/analytics/analyze-report", { reportData: data });
        if (aiRes.data?.data?.summary) {
          setAiSummary(aiRes.data.data.summary);
        }
      } catch (aiErr: any) {
        console.error("AI Analysis failed:", aiErr);
        setAiSummary(aiErr.response?.data?.message || "AI Analysis is currently unavailable. Please ensure OPENROUTER_API_KEY is configured in the backend.");
      }

    } catch (error) {
      console.error("Failed to generate visual report", error);
      alert("Failed to generate visual report. Please try again.");
    } finally {
      setIsGeneratingVisual(false);
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

              <div className="pt-6 space-y-3">
                <button
                  onClick={handleGenerateVisualReport}
                  disabled={isGeneratingVisual || isDownloading}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-3.5 rounded-xl text-sm font-bold shadow-md hover:shadow-xl hover:bg-indigo-700 hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isGeneratingVisual ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" /> Generate Visual Report
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadExcel}
                  disabled={isDownloading || isGeneratingVisual}
                  className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-3.5 rounded-xl text-sm font-bold shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isDownloading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <FileSpreadsheet className="w-5 h-5" /> Download Excel Report
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* Right Column: Preview / Explainer or Actual Report */}
        <div className="lg:col-span-2">
          {!visualReport ? (
            <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm h-full flex flex-col items-center justify-center text-center">
               <div className="w-24 h-24 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-6">
                 <FileSpreadsheet className="w-12 h-12" />
               </div>
               <h2 className="text-2xl font-black text-gray-900 mb-2">Smart Actionable Reports</h2>
               <p className="text-gray-500 max-w-md mx-auto mb-8 font-medium">
                 Select your desired modules on the left and click Generate. The system will compile a deeply comprehensive visual report along with AI-driven insights right here!
                 <br/><br/>
                 You can still export everything to a beautiful Excel file instantly!
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
          ) : (
            <div className="space-y-6">
              
              {/* AI Analysis Summary */}
              {aiSummary && (
                <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl border border-indigo-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-6 h-6 text-indigo-600" />
                    <h2 className="text-xl font-bold text-gray-900">AI Executive Analysis</h2>
                  </div>
                  <MarkdownRenderer content={aiSummary} />
                </div>
              )}
              {!aiSummary && isGeneratingVisual && (
                <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 shadow-sm flex items-center gap-3 animate-pulse">
                  <Sparkles className="w-5 h-5 text-indigo-500 animate-spin" />
                  <span className="text-sm font-medium text-indigo-700">AI is analyzing the report...</span>
                </div>
              )}

              {/* Overview Metrics */}
              {visualReport.overview && (
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h2 className="text-lg font-bold text-gray-900 mb-4">High-Level Overview</h2>
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                     <div className="p-4 bg-gray-50 rounded-xl">
                       <span className="text-xs font-bold text-gray-500 uppercase">Productive Hours</span>
                       <div className="text-2xl font-black text-gray-900 mt-1">{visualReport.overview.totalProductiveHours}h</div>
                     </div>
                     <div className="p-4 bg-gray-50 rounded-xl">
                       <span className="text-xs font-bold text-gray-500 uppercase">Unproductive Hours</span>
                       <div className="text-2xl font-black text-gray-900 mt-1">{visualReport.overview.totalUnproductiveHours}h</div>
                     </div>
                     <div className="p-4 bg-gray-50 rounded-xl">
                       <span className="text-xs font-bold text-gray-500 uppercase">Overtime Hours</span>
                       <div className="text-2xl font-black text-gray-900 mt-1">{visualReport.overview.totalOvertimeHours}h</div>
                     </div>
                     <div className="p-4 bg-gray-50 rounded-xl">
                       <span className="text-xs font-bold text-gray-500 uppercase">EODs Submitted</span>
                       <div className="text-2xl font-black text-gray-900 mt-1">{visualReport.overview.totalEods}</div>
                     </div>
                   </div>
                </div>
              )}

              {/* Top Productive Apps Chart */}
              {visualReport.topProductiveApps && visualReport.topProductiveApps.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart2 className="w-5 h-5 text-emerald-500" />
                    <h2 className="text-lg font-bold text-gray-900">Top Productive Applications</h2>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={visualReport.topProductiveApps} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="app" type="category" width={150} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(val: number) => [`${val.toFixed(2)} hrs`, "Hours"]} />
                        <Bar dataKey="hours" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top Unproductive Apps Chart */}
              {visualReport.topUnproductiveApps && visualReport.topUnproductiveApps.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart2 className="w-5 h-5 text-rose-500" />
                    <h2 className="text-lg font-bold text-gray-900">Top Unproductive Applications</h2>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={visualReport.topUnproductiveApps} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="app" type="category" width={150} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(val: number) => [`${val.toFixed(2)} hrs`, "Hours"]} />
                        <Bar dataKey="hours" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Needs Attention Table */}
              {visualReport.needsAttention && visualReport.needsAttention.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-sm">
                  <h2 className="text-lg font-bold text-rose-600 mb-4">Needs Attention (Lates & Missed EODs)</h2>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                        <tr>
                          <th className="px-4 py-3">Employee</th>
                          <th className="px-4 py-3">Unproductive Hours</th>
                          <th className="px-4 py-3">Late Days</th>
                          <th className="px-4 py-3">Missed EODs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {visualReport.needsAttention.map((emp: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-semibold text-gray-900">{emp.name}</td>
                            <td className="px-4 py-3 text-gray-700">{emp.unproductiveHours.toFixed(2)}h</td>
                            <td className="px-4 py-3 text-rose-600 font-bold">{emp.lateDays}</td>
                            <td className="px-4 py-3 text-rose-600 font-bold">{emp.eodsMissed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
