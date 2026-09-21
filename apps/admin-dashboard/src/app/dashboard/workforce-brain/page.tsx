"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Brain,
  RefreshCw,
  Sparkles,
  Building2,
  Globe,
  CheckCircle2,
  Play,
  Save,
  Search,
  BookOpen,
  Calendar,
  Zap,
} from "lucide-react";

type Department = {
  _id: string;
  name: string;
  description?: string;
  responsibilities?: string[];
  primaryTools?: string[];
  appWorkflows?: Array<{ app: string; pairedApp?: string; description: string }>;
  kbNotes?: string;
};

type AppKnowledge = {
  _id: string;
  appName: string;
  domain: string;
  category: "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
  purpose: string;
  targetDepartments: string[];
  activityTemplates: string[];
  classifiedBy: string;
  lastClassifiedAt: string;
  lastSeenAt?: string;
  seenCount?: number;
  sourceExamples?: Array<{
    app?: string;
    domain?: string;
    title?: string;
    url?: string;
    seenAt?: string;
  }>;
};

type BrainMemory = {
  _id: string;
  scope: "COMPANY" | "DEPARTMENT" | "EMPLOYEE";
  key: string;
  label: string;
  employeeName?: string;
  departmentName?: string;
  summary: string;
  commonTasks: string[];
  commonApplications: string[];
  departmentResponsibilities?: string[];
  lastTrainedAt: string;
  nextRevisionDueAt?: string;
  revisionCycleDays?: number;
  confidence: number;
};

export default function WorkforceBrainPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "overview" | "departments" | "apps" | "simulator"
  >("overview");

  // Fetch Status
  const { data: statusData, isLoading: loadingStatus } = useQuery({
    queryKey: ["workforce-brain-status"],
    queryFn: () => api.get("/api/workforce-brain/status").then((r) => r.data.data),
  });

  // Fetch Departments
  const { data: departments = [], isLoading: loadingDepts } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => api.get("/api/departments").then((r) => r.data.data),
  });

  // Fetch App Knowledge
  const { data: appKnowledge = [], isLoading: loadingApps } = useQuery<AppKnowledge[]>({
    queryKey: ["app-knowledge"],
    queryFn: () => api.get("/api/workforce-brain/app-knowledge").then((r) => r.data.data),
  });

  // Department Editing State
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [responsibilitiesText, setResponsibilitiesText] = useState("");
  const [toolsText, setToolsText] = useState("");
  const [appWorkflowsText, setAppWorkflowsText] = useState("");
  const [kbNotesText, setKbNotesText] = useState("");
  const [deptSavedMsg, setDeptSavedMsg] = useState("");

  // Simulator State
  const [simEmployeeId, setSimEmployeeId] = useState("");
  const [simApp, setSimApp] = useState("Google Sheets");
  const [simDomain, setSimDomain] = useState("sheets.google.com");
  const [simTitle, setSimTitle] = useState("Outbound Call Tracking & Lead Logs - Q3");
  const [simUrl, setSimUrl] = useState("https://docs.google.com/spreadsheets/d/123");
  const [simResult, setSimResult] = useState<any>(null);

  // App Search Filter
  const [appSearch, setAppSearch] = useState("");

  // Retrain Mutation
  const trainMutation = useMutation({
    mutationFn: () =>
      api.post("/api/workforce-brain/train", { days: 60, includeClaude: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workforce-brain-status"] });
    },
  });

  // 15-Day Revision Mutation
  const reviseMutation = useMutation({
    mutationFn: () => api.post("/api/workforce-brain/revise-memory"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workforce-brain-status"] });
    },
  });

  // Update Dept Responsibilities Mutation
  const updateDeptMutation = useMutation({
    mutationFn: (payload: any) =>
      api.put("/api/workforce-brain/department-responsibilities", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setDeptSavedMsg("Department responsibilities saved successfully!");
      setTimeout(() => setDeptSavedMsg(""), 4000);
    },
  });

  // Infer Activity Simulator Mutation
  const inferMutation = useMutation({
    mutationFn: (payload: any) =>
      api.post("/api/workforce-brain/infer-activity", payload).then((r) => r.data.data),
    onSuccess: (data) => {
      setSimResult(data);
    },
  });

  const handleSelectDept = (dept: Department) => {
    setSelectedDeptId(dept._id);
    setResponsibilitiesText((dept.responsibilities || []).join("\n"));
    setToolsText((dept.primaryTools || []).join(", "));
    setAppWorkflowsText(
      (dept.appWorkflows || [])
        .map((workflow) =>
          [workflow.app, workflow.pairedApp || "", workflow.description].join(" | "),
        )
        .join("\n"),
    );
    setKbNotesText(dept.kbNotes || "");
  };

  const parseAppWorkflows = () =>
    appWorkflowsText
      .split("\n")
      .map((line) => {
        const [app = "", pairedApp = "", ...descriptionParts] = line
          .split("|")
          .map((part) => part.trim());
        return {
          app,
          pairedApp,
          description: descriptionParts.join(" | ").trim(),
        };
      })
      .filter((workflow) => workflow.app && workflow.description);

  const handleSaveDept = () => {
    if (!selectedDeptId) return;
    updateDeptMutation.mutate({
      departmentId: selectedDeptId,
      responsibilities: responsibilitiesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      primaryTools: toolsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      appWorkflows: parseAppWorkflows(),
      kbNotes: kbNotesText,
    });
  };

  const memories: BrainMemory[] = statusData?.memories || [];
  const nextRevision = memories.find((m) => m.nextRevisionDueAt)?.nextRevisionDueAt;

  const filteredApps = appKnowledge.filter(
    (app) =>
      app.appName.toLowerCase().includes(appSearch.toLowerCase()) ||
      app.domain.toLowerCase().includes(appSearch.toLowerCase()) ||
      app.purpose.toLowerCase().includes(appSearch.toLowerCase()),
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl backdrop-blur-md">
                <Brain className="w-7 h-7 text-indigo-300" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  ProSync Infotech Workforce Brain
                </h1>
                <p className="text-sm text-indigo-200">
                  AI Context Engine, Department App Intelligence & 15-Day Memory Revision
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => trainMutation.mutate()}
              disabled={trainMutation.isPending}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-md transition-all disabled:opacity-50 text-sm"
            >
              <RefreshCw
                className={`w-4 h-4 ${trainMutation.isPending ? "animate-spin" : ""}`}
              />
              {trainMutation.isPending ? "Training..." : "Retrain Brain Now"}
            </button>
            <button
              onClick={() => reviseMutation.mutate()}
              disabled={reviseMutation.isPending}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-md transition-all disabled:opacity-50 text-sm"
            >
              <Sparkles
                className={`w-4 h-4 ${reviseMutation.isPending ? "animate-spin" : ""}`}
              />
              {reviseMutation.isPending ? "Revising..." : "Run 15-Day Revision"}
            </button>
          </div>
        </div>

        {/* 15-Day Revision Status Card */}
        <div className="mt-6 pt-6 border-t border-indigo-700/50 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-3 bg-indigo-950/40 border border-indigo-700/40 p-3 rounded-xl">
            <Calendar className="w-5 h-5 text-indigo-300 shrink-0" />
            <div>
              <p className="text-indigo-300 font-medium">15-Day Revision Schedule</p>
              <p className="text-white font-semibold mt-0.5">
                {nextRevision
                  ? `Next due: ${new Date(nextRevision).toLocaleDateString()}`
                  : "Auto-revision active (15-day cycle)"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-indigo-950/40 border border-indigo-700/40 p-3 rounded-xl">
            <Brain className="w-5 h-5 text-emerald-300 shrink-0" />
            <div>
              <p className="text-indigo-300 font-medium">Active Memories</p>
              <p className="text-white font-semibold mt-0.5">
                {memories.length} persistent memory records
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-indigo-950/40 border border-indigo-700/40 p-3 rounded-xl">
            <Globe className="w-5 h-5 text-amber-300 shrink-0" />
            <div>
              <p className="text-indigo-300 font-medium">Discovered App Directory</p>
              <p className="text-white font-semibold mt-0.5">
                {appKnowledge.length} applications classified
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-4 px-6 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === "overview"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4" /> Memory Overview ({memories.length})
          </div>
        </button>

        <button
          onClick={() => setActiveTab("departments")}
          className={`pb-4 px-6 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === "departments"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Department Responsibilities
          </div>
        </button>

        <button
          onClick={() => setActiveTab("apps")}
          className={`pb-4 px-6 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === "apps"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> App Directory ({appKnowledge.length})
          </div>
        </button>

        <button
          onClick={() => setActiveTab("simulator")}
          className={`pb-4 px-6 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === "simulator"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" /> Activity Inference Simulator
          </div>
        </button>
      </div>

      {/* Tab 1: Memory Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {memories.map((mem) => (
              <div
                key={mem._id}
                className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span
                      className={`inline-block px-2.5 py-1 text-[11px] font-bold rounded-full uppercase tracking-wider ${
                        mem.scope === "COMPANY"
                          ? "bg-purple-100 text-purple-700"
                          : mem.scope === "DEPARTMENT"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {mem.scope} MEMORY
                    </span>
                    <h3 className="text-lg font-bold text-gray-900 mt-2">
                      {mem.label}
                    </h3>
                  </div>
                  <span className="text-xs text-gray-500 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100 font-mono">
                    Conf: {Math.round((mem.confidence || 0.8) * 100)}%
                  </span>
                </div>

                <p className="text-sm text-gray-600 mt-3 leading-relaxed">
                  {mem.summary}
                </p>

                {mem.departmentResponsibilities &&
                  mem.departmentResponsibilities.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                        Department Responsibilities:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {mem.departmentResponsibilities.map((resp, idx) => (
                          <span
                            key={idx}
                            className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg text-xs"
                          >
                            {resp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-xs text-gray-500">
                  <div>
                    <span className="font-semibold text-gray-700">Last Trained:</span>{" "}
                    {new Date(mem.lastTrainedAt).toLocaleString()}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Next Revision:</span>{" "}
                    {mem.nextRevisionDueAt
                      ? new Date(mem.nextRevisionDueAt).toLocaleDateString()
                      : "15-day cycle"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Department Responsibilities Editor */}
      {activeTab === "departments" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Department List */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Select Department
            </h3>
            <div className="space-y-2">
              {departments.map((dept) => (
                <button
                  key={dept._id}
                  onClick={() => handleSelectDept(dept)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    selectedDeptId === dept._id
                      ? "bg-indigo-50 border-indigo-500 text-indigo-900 font-semibold"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{dept.name}</span>
                    {dept.responsibilities && dept.responsibilities.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-normal mt-0.5 truncate">
                    {dept.description || "No description"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Department Responsibility Editor */}
          <div className="md:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            {selectedDeptId ? (
              <>
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Edit Department Knowledge Base
                    </h3>
                    <p className="text-xs text-gray-500">
                      Define duties and tools to assist AI in activity inference and EOD suggestions.
                    </p>
                  </div>
                  <button
                    onClick={handleSaveDept}
                    disabled={updateDeptMutation.isPending}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-md transition-all"
                  >
                    <Save className="w-4 h-4" /> Save Knowledge
                  </button>
                </div>

                {deptSavedMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {deptSavedMsg}
                  </div>
                )}

                <div className="space-y-4 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                      Department Responsibilities (One per line)
                    </label>
                    <textarea
                      rows={5}
                      value={responsibilitiesText}
                      onChange={(e) => setResponsibilitiesText(e.target.value)}
                      placeholder="e.g. Tele-sales & cold calling&#10;Lead follow-ups & log tracking in Google Sheets&#10;Client onboarding and inquiry handling"
                      className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                      Primary Tools & Software (Comma-separated)
                    </label>
                    <input
                      type="text"
                      value={toolsText}
                      onChange={(e) => setToolsText(e.target.value)}
                      placeholder="Google Sheets, Canva, WhatsApp Web, ChatGPT, Aircall"
                      className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                      Internal Knowledge Base Notes
                    </label>
                    <textarea
                      rows={3}
                      value={kbNotesText}
                      onChange={(e) => setKbNotesText(e.target.value)}
                      placeholder="Special instructions or context for ProSync Infotech AI agents regarding this department..."
                      className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                      App Workflows (App | Paired app | Meaning)
                    </label>
                    <textarea
                      rows={5}
                      value={appWorkflowsText}
                      onChange={(e) => setAppWorkflowsText(e.target.value)}
                      placeholder="Google Sheets | Aircall | Calling leads and updating call logs&#10;Canva | Instagram | Designing social creatives and campaign assets"
                      className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-xs"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-gray-500 space-y-3">
                <Building2 className="w-10 h-10 text-gray-300 mx-auto" />
                <p className="text-sm font-medium">Select a department on the left to edit its knowledge base.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: App Knowledge Directory */}
      {activeTab === "apps" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="text"
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                placeholder="Search apps by name, domain, or purpose..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredApps.map((app) => (
              <div
                key={app._id}
                className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      {app.appName}
                    </h3>
                    <p className="text-xs text-indigo-600 font-mono mt-0.5">
                      {app.domain || "desktop app"}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                      app.category === "PRODUCTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : app.category === "UNPRODUCTIVE"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {app.category}
                  </span>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed">
                  {app.purpose}
                </p>

                {app.targetDepartments && app.targetDepartments.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Relevant Departments:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {app.targetDepartments.map((dept, i) => (
                        <span
                          key={i}
                          className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[11px]"
                        >
                          {dept}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-3 text-[11px] text-gray-500">
                  <div>
                    <span className="font-semibold text-gray-700">Seen:</span>{" "}
                    {app.seenCount || 0} times
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Last seen:</span>{" "}
                    {app.lastSeenAt ? new Date(app.lastSeenAt).toLocaleDateString() : "Never"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Activity Inference Simulator */}
      {activeTab === "simulator" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-gray-900 border-b pb-3">
              Test Activity Inference Prediction
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Employee ID
                </label>
                <input
                  type="text"
                  value={simEmployeeId}
                  onChange={(e) => setSimEmployeeId(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                  placeholder="e.g. EMP_01_02"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Active Application Name
                </label>
                <input
                  type="text"
                  value={simApp}
                  onChange={(e) => setSimApp(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                  placeholder="e.g. Google Sheets, Canva, ChatGPT"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Web Domain
                </label>
                <input
                  type="text"
                  value={simDomain}
                  onChange={(e) => setSimDomain(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                  placeholder="e.g. sheets.google.com, canva.com"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Chrome Active Page Title
                </label>
                <input
                  type="text"
                  value={simTitle}
                  onChange={(e) => setSimTitle(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                  placeholder="e.g. Outbound Call Logs - Comms Q3"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  URL
                </label>
                <input
                  type="text"
                  value={simUrl}
                  onChange={(e) => setSimUrl(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                  placeholder="https://docs.google.com/spreadsheets/..."
                />
              </div>

              <button
                onClick={() =>
                  inferMutation.mutate({
                    employeeId: simEmployeeId,
                    app: simApp,
                    domain: simDomain,
                    title: simTitle,
                    url: simUrl,
                  })
                }
                disabled={inferMutation.isPending}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl font-medium shadow-md transition-all"
              >
                <Play className="w-4 h-4" />
                {inferMutation.isPending ? "Predicting..." : "Predict Activity Inference"}
              </button>
            </div>
          </div>

          {/* Simulation Output */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-4">
            <h3 className="text-base font-bold text-indigo-300 border-b border-slate-800 pb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" /> AI Prediction Output
            </h3>

            {simResult ? (
              <div className="space-y-4 text-xs font-mono">
                <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 space-y-2">
                  <p className="text-emerald-400 font-bold text-sm">
                    Inferred Activity:
                  </p>
                  <p className="text-white text-sm font-sans leading-relaxed">
                    {simResult.inferredActivity}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                    <p className="text-slate-400 font-sans text-[11px]">
                      Department Name:
                    </p>
                    <p className="text-indigo-300 font-bold mt-0.5">
                      {simResult.departmentName}
                    </p>
                  </div>

                  <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                    <p className="text-slate-400 font-sans text-[11px]">
                      Confidence Score:
                    </p>
                    <p className="text-emerald-400 font-bold mt-0.5">
                      {Math.round((simResult.confidence || 0.8) * 100)}%
                    </p>
                  </div>
                </div>

                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 space-y-1">
                  <p className="text-slate-400 font-sans text-[11px]">
                    App Operational Purpose:
                  </p>
                  <p className="text-slate-200 font-sans">
                    {simResult.appPurpose}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500 font-sans space-y-2">
                <Brain className="w-10 h-10 text-slate-700 mx-auto" />
                <p className="text-xs">
                  Fill in the Chrome window title & app details on the left and click Predict to see the output.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
