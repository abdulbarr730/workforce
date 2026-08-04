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
  BarChart2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export default function ReportsDashboardPage() {
  const [activeTab, setActiveTab] = useState<"custom" | "eod_engine">("eod_engine");

  // --- Custom Report Builder State ---
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedEmployee, setSelectedEmployee] = useState("");

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

  // --- EOD Analysis Engine State ---
  const [analysisDate, setAnalysisDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [analysisEmployeeId, setAnalysisEmployeeId] = useState("");
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<any>(null);
  const [engineFilter, setEngineFilter] = useState<"ALL" | "FLAGGED" | "COMPLETED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  // Fetch initial analysis report on load
  useQuery({
    queryKey: ["daily-flow-analysis", analysisDate, analysisEmployeeId],
    queryFn: async () => {
      const res = await api.get(
        `/api/daily-flow/admin/analysis/report?date=${analysisDate}&employeeId=${analysisEmployeeId || ""}`
      );
      setAnalysisReport(res.data?.data);
      return res.data?.data;
    },
  });

  const handleRunAnalysisEngine = async () => {
    try {
      setIsGeneratingAnalysis(true);
      const res = await api.post("/api/daily-flow/admin/analysis/generate", {
        date: analysisDate,
        employeeId: analysisEmployeeId || undefined,
      });
      setAnalysisReport(res.data?.data);
    } catch (err) {
      console.error("Failed to run analysis engine", err);
      alert("Failed to run EOD Analysis Engine.");
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  const getCustomPayload = () => ({
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
      const response = await api.post("/api/analytics/custom-report", getCustomPayload(), {
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

  const handleDownloadEodReportExcel = () => {
    if (!analysisReport?.employeeReports) return;

    const headers = [
      "Date",
      "Employee Name",
      "Employee ID",
      "Department",
      "Time Interval",
      "Task Description",
      "Duration (hrs)",
      "Raw Time",
      "Top 3 Task",
      "Completion Rate %",
      "Adherence Score %",
      "Total Logged (hrs)",
      "Expected (hrs)",
    ];

    const rows: string[][] = [headers];

    analysisReport.employeeReports.forEach((emp: any) => {
      if (emp.timeline && emp.timeline.length > 0) {
        emp.timeline.forEach((t: any) => {
          rows.push([
            analysisDate,
            `"${(emp.name || "").replace(/"/g, '""')}"`,
            `"${(emp.employeeId || "").replace(/"/g, '""')}"`,
            `"${(emp.department || "-").replace(/"/g, '""')}"`,
            `"${(t.interval || "-").replace(/"/g, '""')}"`,
            `"${(t.task || "").replace(/"/g, '""')}"`,
            String(t.durationHours || 0),
            `"${(t.timeTaken || "-").replace(/"/g, '""')}"`,
            t.isTopTask ? "YES" : "NO",
            `"${emp.metrics?.completionRate || 0}%"`,
            `"${emp.metrics?.timeAdherenceScore || 0}%"`,
            String(emp.metrics?.totalLoggedHours || 0),
            String(emp.metrics?.expectedShiftHours || 0),
          ]);
        });
      } else {
        rows.push([
          analysisDate,
          `"${(emp.name || "").replace(/"/g, '""')}"`,
          `"${(emp.employeeId || "").replace(/"/g, '""')}"`,
          `"${(emp.department || "-").replace(/"/g, '""')}"`,
          "-",
          `"No tasks recorded"`,
          "0",
          "-",
          "NO",
          `"${emp.metrics?.completionRate || 0}%"`,
          `"${emp.metrics?.timeAdherenceScore || 0}%"`,
          String(emp.metrics?.totalLoggedHours || 0),
          String(emp.metrics?.expectedShiftHours || 0),
        ]);
      }
    });

    const csvContent = "\uFEFF" + rows.map((e) => e.join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `EOD_Daily_Flow_Report_${analysisDate}.csv`);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
  };

  const handleGenerateVisualReport = async () => {
    try {
      setIsGeneratingVisual(true);
      setVisualReport(null);
      setAiSummary(null);

      const res = await api.post("/api/analytics/visual-report", getCustomPayload());
      const data = res.data.data;
      setVisualReport(data);

      try {
        const aiPayloadData = {
          overview: data.overview,
          topProductiveApps: data.topProductiveApps,
          topUnproductiveApps: data.topUnproductiveApps,
          needsAttention: data.needsAttention,
          latecomers: data.latecomers,
          employeeList: data.employeeList || [],
        };
        const aiRes = await api.post("/api/analytics/analyze-report", { reportData: aiPayloadData });
        if (aiRes.data?.data?.summary) {
          setAiSummary(aiRes.data.data.summary);
        }
      } catch (aiErr: any) {
        console.error("AI Analysis failed:", aiErr);
        const serverError = aiErr.response?.data?.message;
        setAiSummary(serverError || "AI Analysis unavailable at this moment.");
      }
    } catch (error) {
      console.error("Failed to generate visual report", error);
      alert("Failed to generate visual report. Please try again.");
    } finally {
      setIsGeneratingVisual(false);
    }
  };

  const filteredEmployeeReports = useMemo(() => {
    if (!analysisReport?.employeeReports) return [];
    return analysisReport.employeeReports.filter((emp: any) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.department && emp.department.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (engineFilter === "FLAGGED") {
        return emp.recommendations && emp.recommendations.length > 0;
      }
      if (engineFilter === "COMPLETED") {
        return emp.metrics.completionRate >= 80;
      }
      return true;
    });
  }, [analysisReport, engineFilter, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto pb-12 space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-50/70 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2.5">
              <LineChart className="w-7 h-7 text-indigo-600" />
              Advanced Analytics & Reports Hub
            </h1>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              Analyze daily To-Do adherence, 2-hour check-in intervals, EOD timelines, and export comprehensive enterprise reports.
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center bg-gray-100 p-1.5 rounded-xl border border-gray-200">
            <button
              onClick={() => setActiveTab("eod_engine")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "eod_engine"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Clock className="w-4 h-4" />
              EOD & Work Flow Analysis Engine
            </button>
            <button
              onClick={() => setActiveTab("custom")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "custom"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Settings2 className="w-4 h-4" />
              Custom Report Builder
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: EOD & WORK FLOW ANALYSIS ENGINE SECTION                            */}
      {/* ========================================================================= */}
      {activeTab === "eod_engine" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={analysisDate}
                  onChange={(e) => setAnalysisDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none"
                />
              </div>

              <select
                value={analysisEmployeeId}
                onChange={(e) => setAnalysisEmployeeId(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold bg-gray-50 text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
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

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search name, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-gray-50 text-gray-800 outline-none w-44"
                />
              </div>

              <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-200">
                <button
                  onClick={() => setEngineFilter("ALL")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                    engineFilter === "ALL" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setEngineFilter("COMPLETED")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                    engineFilter === "COMPLETED" ? "bg-emerald-50 text-emerald-700 shadow-xs" : "text-gray-500"
                  }`}
                >
                  High Adherence
                </button>
                <button
                  onClick={() => setEngineFilter("FLAGGED")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                    engineFilter === "FLAGGED" ? "bg-rose-50 text-rose-700 shadow-xs" : "text-gray-500"
                  }`}
                >
                  Needs Review
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRunAnalysisEngine}
                disabled={isGeneratingAnalysis}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow hover:bg-indigo-700 disabled:opacity-60 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAnalysis ? "animate-spin" : ""}`} />
                {isGeneratingAnalysis ? "Analyzing Engine..." : "Run Analysis Engine"}
              </button>

              <button
                onClick={handleDownloadEodReportExcel}
                disabled={!analysisReport?.employeeReports?.length}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold shadow hover:bg-slate-800 disabled:opacity-60 transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export EOD Report
              </button>
            </div>
          </div>

          {/* Analysis Engine Summary KPI Cards */}
          {analysisReport?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Employees Analyzed</span>
                <div className="text-2xl font-black text-gray-900 mt-1">
                  {analysisReport.summary.totalEmployeesAnalyzed}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {analysisReport.summary.eodSubmittedCount} EODs submitted
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Avg Completion Rate</span>
                <div className="text-2xl font-black text-indigo-600 mt-1">
                  {analysisReport.summary.avgCompletionRate}%
                </div>
                <div className="text-[11px] text-indigo-500 mt-0.5">Planned vs Done To-Dos</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Avg Time Adherence</span>
                <div className="text-2xl font-black text-emerald-600 mt-1">
                  {analysisReport.summary.avgTimeAdherence}%
                </div>
                <div className="text-[11px] text-emerald-500 mt-0.5">Logged vs Shift Duration</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Tracked Work</span>
                <div className="text-2xl font-black text-amber-600 mt-1">
                  {analysisReport.summary.totalLoggedHours}h
                </div>
                <div className="text-[11px] text-amber-500 mt-0.5">Across all 2-hr windows</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Engine Generated At</span>
                <div className="text-sm font-bold text-gray-800 mt-2 truncate">
                  {new Date(analysisReport.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">Auto-runs 8 PM – 12 AM</div>
              </div>
            </div>
          )}

          {/* Employee Chronological Timeline & Analysis Cards */}
          <div className="space-y-4">
            {filteredEmployeeReports.length === 0 ? (
              <div className="bg-white p-10 rounded-2xl border border-gray-200 shadow-sm text-center">
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-gray-700">No Daily Flow Data for {analysisDate}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Employees have not submitted their check-ins or EOD report for this date yet.
                </p>
              </div>
            ) : (
              filteredEmployeeReports.map((emp: any, idx: number) => {
                const adherenceColor =
                  emp.metrics.timeAdherenceScore >= 85
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : emp.metrics.timeAdherenceScore >= 50
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-rose-50 text-rose-700 border-rose-200";

                return (
                  <div
                    key={emp.employeeId || idx}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:border-indigo-300 transition-all"
                  >
                    {/* Employee Card Header */}
                    <div className="p-5 bg-gradient-to-r from-gray-50 via-white to-gray-50 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-black text-base flex items-center justify-center shadow">
                          {emp.name?.charAt(0) || "E"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-gray-900">{emp.name}</h3>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                              {emp.employeeId}
                            </span>
                            {emp.department && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">
                                {emp.department}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 font-medium">
                            <span>Shift: {emp.shiftDetails?.name || "Standard (9h)"}</span>
                            <span>•</span>
                            <span>
                              Logged: <b className="text-gray-800">{emp.metrics.totalLoggedHours}h</b> / Expected:{" "}
                              {emp.metrics.expectedShiftHours}h
                            </span>
                            <span>•</span>
                            <span>2-Hr Check-ins: <b className="text-indigo-600">{emp.metrics.checkinCount} logged</b></span>
                          </div>
                        </div>
                      </div>

                      {/* Score Badges */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">To-Do Completion</span>
                          <span className="text-sm font-extrabold text-indigo-600">
                            {emp.metrics.completedTodos}/{emp.metrics.plannedTodos} ({emp.metrics.completionRate}%)
                          </span>
                        </div>

                        <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${adherenceColor}`}>
                          <Flame className="w-3.5 h-3.5" />
                          Adherence: {emp.metrics.timeAdherenceScore}%
                        </div>
                      </div>
                    </div>

                    {/* Timeline Breakdown Section */}
                    <div className="p-5 space-y-4">
                      <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-600" />
                          Chronological 2-Hour Work Timeline & Durations
                        </h4>

                        {emp.timeline && emp.timeline.length > 0 ? (
                          <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-2.5 w-44">Time Interval</th>
                                  <th className="px-4 py-2.5">Task Description</th>
                                  <th className="px-4 py-2.5 text-center w-24">Top 3</th>
                                  <th className="px-4 py-2.5 text-right w-32">Duration</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {emp.timeline.map((item: any, i: number) => (
                                  <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                                    <td className="px-4 py-2.5 font-bold text-gray-700">
                                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                                        {item.interval}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-900 font-medium whitespace-normal">
                                      <div className="flex items-center gap-2">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        <span>{item.task}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      {item.isTopTask ? (
                                        <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded border border-amber-200">
                                          ⭐ Top Task
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-extrabold text-indigo-600 font-mono">
                                      {item.timeTaken || `${item.durationHours}h`}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-400 italic">
                            No discrete 2-hour interval tasks recorded for this day.
                          </div>
                        )}
                      </div>

                      {/* Recommendations & Engine Flags */}
                      {emp.recommendations && emp.recommendations.length > 0 && (
                        <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-800 space-y-1">
                            <span className="font-bold block">Engine Insights & Observations:</span>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {emp.recommendations.map((rec: string, rIdx: number) => (
                                <li key={rIdx}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CUSTOM REPORT BUILDER & AI VISUAL REPORT SECTION                   */}
      {/* ========================================================================= */}
      {activeTab === "custom" && (
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
                      className="flex-1 px-3 py-2 bg-transparent text-xs font-medium outline-none"
                    />
                    <span className="text-gray-400 font-bold">→</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex-1 px-3 py-2 bg-transparent text-xs font-medium outline-none"
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
                      {includeAttendance ? (
                        <CheckSquare className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700">Attendance & Login/Logout Timings</span>
                  </label>

                  <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-3" onClick={() => setIncludeProductive(!includeProductive)}>
                        {includeProductive ? (
                          <CheckSquare className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />
                        )}
                        <span className="text-sm font-semibold text-gray-700">Top Productive Apps</span>
                      </div>
                      {includeProductive && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Up to:</span>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={topProductiveLimit}
                            onChange={(e) => setTopProductiveLimit(Number(e.target.value))}
                            className="w-16 px-2 py-1 text-sm border border-gray-200 rounded-md outline-none focus:border-indigo-500"
                          />
                        </div>
                      )}
                    </label>
                  </div>

                  <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-3" onClick={() => setIncludeUnproductive(!includeUnproductive)}>
                        {includeUnproductive ? (
                          <CheckSquare className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />
                        )}
                        <span className="text-sm font-semibold text-gray-700">Top Unproductive Apps</span>
                      </div>
                      {includeUnproductive && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Up to:</span>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={topUnproductiveLimit}
                            onChange={(e) => setTopUnproductiveLimit(Number(e.target.value))}
                            className="w-16 px-2 py-1 text-sm border border-gray-200 rounded-md outline-none focus:border-indigo-500"
                          />
                        </div>
                      )}
                    </label>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div onClick={() => setIncludeShifts(!includeShifts)}>
                      {includeShifts ? (
                        <CheckSquare className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-700 block">Shifts & Weekend Activity</span>
                      <span className="text-xs text-gray-500">Includes day of week to easily spot Sunday workers.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div onClick={() => setIncludeNeedsAttention(!includeNeedsAttention)}>
                      {includeNeedsAttention ? (
                        <CheckSquare className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-300 group-hover:text-gray-400" />
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700">Needs Attention (Late, Missed EODs)</span>
                  </label>
                </div>

                <div className="pt-6 space-y-3">
                  <button
                    onClick={handleGenerateVisualReport}
                    disabled={isGeneratingVisual || isDownloading}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-3.5 rounded-xl text-sm font-bold shadow-md hover:shadow-xl hover:bg-indigo-700 hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
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
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-3.5 rounded-xl text-sm font-bold shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
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

          {/* Right Column: Preview or Visual Report */}
          <div className="lg:col-span-2">
            {!visualReport ? (
              <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm h-full flex flex-col items-center justify-center text-center">
                <div className="w-24 h-24 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-6">
                  <FileSpreadsheet className="w-12 h-12" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 mb-2">Smart Actionable Reports</h2>
                <p className="text-gray-500 max-w-md mx-auto mb-8 font-medium">
                  Select your desired modules on the left and click Generate. The system will compile a deeply comprehensive visual report along with AI-driven insights right here!
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

                {/* Detailed Attendance Table */}
                {visualReport.detailedAttendance && visualReport.detailedAttendance.length > 0 && (
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <UserCircle2 className="w-5 h-5 text-indigo-500" />
                      Detailed Attendance & Timings
                    </h2>
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                          <tr>
                            <th className="px-4 py-3">Employee</th>
                            <th className="px-4 py-3">Total Days</th>
                            <th className="px-4 py-3 text-emerald-600">Present</th>
                            <th className="px-4 py-3 text-rose-600">Late Days</th>
                            <th className="px-4 py-3 text-blue-600">Avg Login</th>
                            <th className="px-4 py-3 text-orange-600">Avg Logout</th>
                            <th className="px-4 py-3">Avg Productive Hrs</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {visualReport.detailedAttendance.map((emp: any, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-semibold text-gray-900">
                                {emp.name} {emp.employeeId ? `(${emp.employeeId})` : ""}
                              </td>
                              <td className="px-4 py-3 text-gray-700">{emp.totalDays}</td>
                              <td className="px-4 py-3 font-medium text-emerald-600">{emp.presentDays}</td>
                              <td className="px-4 py-3 font-medium text-rose-600">{emp.lateDays}</td>
                              <td className="px-4 py-3 font-medium text-blue-700">{emp.avgLoginTime}</td>
                              <td className="px-4 py-3 font-medium text-orange-700">{emp.avgLogoutTime}</td>
                              <td className="px-4 py-3 font-semibold text-gray-700">{emp.avgProductiveHours}h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
