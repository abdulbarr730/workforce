"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const PIE_COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6"];

function fmtSecs(s: number) {
  if (!s) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m ${secs}s`;
  if (m > 0) return `${m}m ${secs}s`;
  return `${secs}s`;
}

export default function AnalyticsPage() {
  const [employeeId, setEmployeeId] = useState("");
  const [dateInput, setDateInput] = useState(new Date().toISOString().split("T")[0]);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: liveStats, isLoading } = useQuery({
    queryKey: ["analytics-live", employeeId, dateInput],
    queryFn: () =>
      api.get(`/api/analytics/live?employeeId=${employeeId}&date=${dateInput}`).then((r) => r.data.data),
    enabled: !!employeeId,
    refetchInterval: 15_000,
  });

  const { data: trendAnalytics } = useQuery({
    queryKey: ["analytics-trend", employeeId],
    queryFn: () =>
      api.get(`/api/analytics/employee-trend?employeeId=${employeeId}`).then((r) => r.data.data),
    enabled: !!employeeId,
  });

  const { data: feed } = useQuery({
    queryKey: ["analytics-feed", employeeId, dateInput],
    queryFn: () =>
      api.get(`/api/analytics/feed?employeeId=${employeeId}&date=${dateInput}&limit=2000`).then((r) => r.data.data),
    enabled: !!employeeId,
    refetchInterval: 15_000,
  });

  const allUsers = Array.isArray(users) ? users : (users?.users ?? []);
  const employees = allUsers.filter((u: { role: string }) => u.role !== "SUPER_ADMIN");

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      <div className="bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] pt-12 pb-24 px-6 md:px-10 rounded-b-[40px] shadow-2xl relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[150%] bg-white/5 blur-[120px] rounded-full transform rotate-45 pointer-events-none" />
          <div className="absolute top-[30%] -right-[10%] w-[40%] h-[100%] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Analytics Studio</h1>
            <p className="text-indigo-200 mt-2 text-sm md:text-base font-medium opacity-90">Deep insights, precise down to the second.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 backdrop-blur-md bg-white/10 p-2 rounded-2xl border border-white/20 shadow-xl">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 transition-colors border border-white/10 rounded-xl text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none min-w-[200px]"
            >
              <option value="" className="text-gray-900">Select an employee…</option>
              {employees.map((e: { employeeId: string; name: string; role: string }) => (
                <option key={e.employeeId} value={e.employeeId} className="text-gray-900">
                  {e.name} ({e.employeeId})
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 transition-colors border border-white/10 rounded-xl text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-20 space-y-8">
        {!employeeId ? (
          <div className="bg-white/70 backdrop-blur-xl p-16 text-center rounded-[30px] border border-gray-100 shadow-xl flex flex-col items-center justify-center">
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800">No Employee Selected</h3>
            <p className="text-gray-500 mt-2 max-w-sm">Please select a team member from the dropdown above to unlock their detailed activity insights.</p>
          </div>
        ) : isLoading ? (
          <div className="bg-white p-12 text-center rounded-[30px] border border-gray-100 shadow-lg flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-500 font-medium">Crunching the data...</p>
          </div>
        ) : liveStats && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: "Total Tracked Time", value: fmtSecs(liveStats.totalTrackedSeconds), color: "text-indigo-600", bg: "bg-indigo-50/50", border: "border-indigo-100" },
                { label: "Productive Focus", value: fmtSecs(liveStats.productiveSeconds), color: "text-emerald-600", bg: "bg-emerald-50/50", border: "border-emerald-100" },
                { label: "Idle / Away", value: fmtSecs(liveStats.idleSeconds), color: "text-amber-600", bg: "bg-amber-50/50", border: "border-amber-100" },
                { label: "Focus Score", value: `${(liveStats.focusScore ?? 0).toFixed(1)}%`, color: "text-blue-600", bg: "bg-blue-50/50", border: "border-blue-100" },
              ].map(({ label, value, color, bg, border }, i) => (
                <div key={label} className={`group ${bg} rounded-3xl border ${border} p-6 shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-1 relative z-10`}>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-2 opacity-80">{label}</p>
                  <p 
                    className={`text-3xl font-black tracking-tight ${color} flex items-baseline`}
                    dangerouslySetInnerHTML={{
                      __html: value.replace(/([0-9.]+)([a-z%]+)/gi, '$1<span class="text-base font-bold opacity-60 ml-0.5 mr-2">$2</span>')
                    }} 
                  />
                  <div className="mt-4 h-1 w-full bg-white/50 rounded-full overflow-hidden">
                    <div className={`h-full ${color.replace('text-', 'bg-')} opacity-20 group-hover:opacity-100 transition-opacity w-3/4 rounded-full`} />
                  </div>
                </div>
              ))}
            </div>

            {/* Session Indicator */}
            {liveStats.sessionStart && (
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-4 shadow-xl border border-gray-700 flex flex-col sm:flex-row items-center justify-between text-white overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                <div className="flex items-center gap-4 z-10">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">Active Session Details</p>
                    <p className="text-sm font-medium mt-0.5">
                      First activity started at <span className="text-emerald-300">{new Date(liveStats.sessionStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 sm:mt-0 flex gap-6 text-sm font-medium bg-white/5 px-6 py-2.5 rounded-xl border border-white/10 z-10">
                  <div className="flex flex-col">
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider">Last Seen</span>
                    <span>{liveStats.lastSeen ? new Date(liveStats.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "N/A"}</span>
                  </div>
                  <div className="w-px bg-white/10 my-1"></div>
                  <div className="flex flex-col">
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider">Total Events</span>
                    <span className="text-indigo-300">{liveStats.eventCount}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Charts Row */}
            {liveStats.topApps && liveStats.topApps.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Visual Chart */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 hover:shadow-lg transition-shadow">
                  <h2 className="text-base font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">🎯</span>
                    Screen Time Breakdown
                  </h2>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={liveStats.topApps}
                          dataKey="seconds"
                          nameKey="app"
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={90}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {liveStats.topApps.map((_: unknown, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} className="hover:opacity-80 transition-opacity" />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(v: number) => [fmtSecs(v), "Time Spent"]}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top Apps List */}
                <div className="lg:col-span-3 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 hover:shadow-lg transition-shadow">
                  <h2 className="text-base font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">🏆</span>
                    Top Applications
                  </h2>
                  <div className="space-y-4 max-h-[260px] overflow-y-auto pr-2 custom-scrollbar">
                    {liveStats.topApps.map(({ app, seconds }: { app: string; seconds: number }, i: number) => {
                      const pct = liveStats.totalTrackedSeconds ? ((seconds / liveStats.totalTrackedSeconds) * 100).toFixed(1) : 0;
                      return (
                        <div key={app} className="group relative">
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="flex items-center gap-3">
                              <span
                                className="w-3 h-3 rounded-md shrink-0 shadow-sm transition-transform group-hover:scale-125"
                                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                              />
                              <span className="font-semibold text-gray-800">{app}</span>
                            </span>
                            <span className="text-gray-600 font-mono text-xs bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                              {fmtSecs(seconds)} <span className="text-gray-400 ml-1">({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-1000 ease-out"
                              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${PIE_COLORS[i % PIE_COLORS.length]}dd, ${PIE_COLORS[i % PIE_COLORS.length]})` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {liveStats.totalTrackedSeconds === 0 && (
              <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl mx-auto flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">No Activity Detected</h3>
                <p className="text-gray-500 max-w-md mx-auto">There are no tracked events for {formatDate(dateInput)}. The employee has not logged any time today.</p>
              </div>
            )}
          </div>
        )}

        {/* 7-day trend */}
        {trendAnalytics && trendAnalytics.length > 0 && (
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-lg transition-shadow animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
            <h2 className="text-base font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">📈</span>
              Productivity Trend (Last 7 Days)
            </h2>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendAnalytics.slice(-7)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                    }
                    dy={10}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: '#94a3b8' }} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${Math.round(v / 3600)}h`} 
                  />
                  <Tooltip 
                    formatter={(v: number) => [fmtSecs(v), "Productive Time"]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 500 }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar 
                    dataKey="productiveSeconds" 
                    fill="url(#colorGradient)" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={40}
                  />
                  <defs>
                    <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={1} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Activity Feed Timeline */}
        {feed && feed.length > 0 && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 lg:p-8 hover:shadow-lg transition-shadow animate-in fade-in slide-in-from-bottom-12 duration-700 delay-300 fill-mode-both">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-6 border-b border-gray-50">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center text-lg">⚡</span>
                  Detailed Event Timeline
                </h2>
                <p className="text-sm text-gray-500 mt-1 ml-12">Precise granular tracking of all desktop interactions.</p>
              </div>
              <div className="mt-4 sm:mt-0 ml-12 sm:ml-0 bg-violet-50 border border-violet-100 text-violet-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm">
                {feed.length} Events Logged Today
              </div>
            </div>
            
            <div className="relative pl-6 sm:pl-10 space-y-8 max-h-[800px] overflow-y-auto custom-scrollbar pr-4 pb-4">
              {/* Timeline central line */}
              <div className="absolute top-4 bottom-4 left-[19px] sm:left-[35px] w-0.5 bg-gradient-to-b from-gray-100 via-gray-200 to-transparent"></div>
              
              {feed.map((ev: any, idx: number) => {
                const date = new Date(ev.timestamp);
                const isProductive = ev.productivityCategory === "PRODUCTIVE";
                const isUnproductive = ev.productivityCategory === "UNPRODUCTIVE";
                
                // Styling based on event type
                let badgeStyle = "bg-gray-100 text-gray-600 border-gray-200";
                let iconStyle = "bg-white border-gray-200";
                let icon = "•";
                
                if (ev.type === 'ACTIVE_WINDOW') {
                  badgeStyle = "bg-blue-50 text-blue-700 border-blue-100";
                  iconStyle = isProductive ? "bg-emerald-500 border-emerald-100 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                            : isUnproductive ? "bg-red-500 border-red-100 shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
                            : "bg-gray-400 border-gray-100";
                  icon = ""; // dot
                } else if (ev.type.includes('IDLE')) {
                  badgeStyle = "bg-amber-50 text-amber-700 border-amber-100";
                  iconStyle = "bg-amber-100 border-amber-300 text-amber-600 text-[10px]";
                  icon = "⏸";
                } else if (ev.type.includes('SESSION')) {
                  badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-100";
                  iconStyle = "bg-emerald-100 border-emerald-300 text-emerald-600 text-[10px]";
                  icon = "▶";
                }
                
                return (
                  <div key={idx} className="relative group">
                    {/* Timeline Dot */}
                    <div className={`absolute -left-[30px] sm:-left-[46px] w-[22px] h-[22px] rounded-full border-[3px] flex items-center justify-center z-10 transition-transform group-hover:scale-125 ${iconStyle}`}>
                      {icon && <span className="block mb-0.5 font-bold">{icon}</span>}
                    </div>

                    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] transition-all hover:border-gray-200 group-hover:-translate-y-0.5">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest uppercase border ${badgeStyle}`}>
                              {ev.type.replace(/_/g, ' ')}
                            </span>
                            
                            {ev.app && (
                              <span className="font-bold text-gray-900 text-sm truncate px-1">
                                {ev.app}
                              </span>
                            )}
                            
                            {ev.isBrowser && ev.domain && (
                              <span className="text-[11px] font-medium bg-cyan-50/80 text-cyan-700 px-2.5 py-1 rounded-lg border border-cyan-100 flex items-center gap-1.5">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                                {ev.domain}
                              </span>
                            )}
                          </div>
                          
                          {ev.title && (
                            <p className="text-gray-700 text-sm font-medium mb-1 line-clamp-2 leading-relaxed" title={ev.title}>
                              {ev.title}
                            </p>
                          )}
                          
                          {ev.isBrowser && ev.url && (
                            <div className="mt-2 bg-gray-50 rounded-lg border border-gray-100 p-2 flex items-center gap-2 overflow-hidden">
                              <span className="text-gray-400 bg-white p-1 rounded-md shadow-sm border border-gray-50">🔗</span>
                              <a href={ev.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 text-xs truncate font-medium hover:underline transition-colors" title={ev.url}>
                                {ev.url}
                              </a>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex md:flex-col items-center md:items-end justify-between shrink-0 gap-2 border-t md:border-t-0 border-gray-100 pt-3 md:pt-0">
                          <div className="text-gray-500 text-xs font-semibold bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                          
                          {ev.durationSeconds > 0 && (
                            <div className="text-indigo-700 text-xs font-bold font-mono bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {fmtSecs(ev.durationSeconds)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      
      {/* Custom styles for animations & scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}} />
    </div>
  );
}
