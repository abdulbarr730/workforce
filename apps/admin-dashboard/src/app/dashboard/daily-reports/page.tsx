"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, Clock, CheckCircle2, XCircle, LayoutList, Check, User as UserIcon } from "lucide-react";

interface DailyStatus {
  _id: string;
  employeeId: string;
  name: string;
  department: string | null;
  todo: { items: any[]; submittedAt: string } | null;
  eod: { summary: string; completedItems: string[]; hoursWorked: string; submittedAt: string } | null;
  loginTime: string | null;
  logoutTime: string | null;
}

export default function DailyReportsPage() {
  const [dateInput, setDateInput] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<DailyStatus | null>(null);

  const { data: statuses, isLoading } = useQuery({
    queryKey: ["daily-status", dateInput],
    queryFn: () => api.get(`/api/daily-flow/status?date=${dateInput}`).then((r) => r.data.data),
  });

  const filtered = (statuses || []).filter((s: DailyStatus) => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.employeeId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of To-Dos and EOD submissions across the team.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
            />
          </div>
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-gray-700 w-full sm:w-auto bg-gray-50 hover:bg-gray-100 transition-colors"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">Loading daily status...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((user: DailyStatus) => {
            const hasTodo = !!user.todo;
            const hasEod = !!user.eod;
            
            // Green if To-Do submitted, Red if missing
            const borderClass = hasTodo ? "border-emerald-500 shadow-emerald-500/10" : "border-red-400 shadow-red-500/10";
            
            return (
              <div 
                key={user.employeeId} 
                onClick={() => setSelectedUser(user)}
                className={`bg-white rounded-2xl p-5 border-2 ${borderClass} shadow-md hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-sm ${hasTodo ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 leading-tight">{user.name}</h3>
                      <p className="text-xs text-gray-500 font-medium">{user.employeeId}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="text-gray-600 flex items-center gap-2">
                      <LayoutList className="w-4 h-4 text-indigo-400" /> To-Do
                    </span>
                    {hasTodo ? (
                      <span className="text-emerald-600 font-bold flex items-center gap-1 text-xs">
                        <CheckCircle2 className="w-4 h-4" /> Submitted
                      </span>
                    ) : (
                      <span className="text-red-500 font-bold flex items-center gap-1 text-xs">
                        <XCircle className="w-4 h-4" /> Missing
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="text-gray-600 flex items-center gap-2">
                      <Check className="w-4 h-4 text-violet-400" /> EOD
                    </span>
                    {hasEod ? (
                      <span className="text-emerald-600 font-bold flex items-center gap-1 text-xs">
                        <CheckCircle2 className="w-4 h-4" /> Submitted
                      </span>
                    ) : (
                      <span className="text-gray-400 font-bold flex items-center gap-1 text-xs">
                        <Clock className="w-4 h-4" /> Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {filtered.length === 0 && (
            <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-dashed border-gray-300">
              <UserIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No employees found for this criteria.</p>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedUser.name}</h2>
                <p className="text-sm text-gray-500 font-medium">{selectedUser.employeeId} {selectedUser.department ? `• ${selectedUser.department}` : ''}</p>
              </div>
              <button 
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* Session Timeline */}
              <div className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100">
                <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Session Log
                </h3>
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <div className="flex-1 bg-white p-3 rounded-xl border border-blue-100 shadow-sm text-center">
                    <p className="text-xs text-gray-500 font-bold mb-1 uppercase">Login Time</p>
                    <p className="text-lg font-black text-emerald-600">
                      {selectedUser.loginTime ? new Date(selectedUser.loginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                  <div className="h-px sm:h-8 w-12 sm:w-px bg-blue-200 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400"></div>
                  </div>
                  <div className="flex-1 bg-white p-3 rounded-xl border border-blue-100 shadow-sm text-center">
                    <p className="text-xs text-gray-500 font-bold mb-1 uppercase">Logout Time</p>
                    <p className="text-lg font-black text-indigo-600">
                      {selectedUser.logoutTime ? new Date(selectedUser.logoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (selectedUser.loginTime ? <span className="text-emerald-600 text-base">Ongoing</span> : '—')}
                    </p>
                  </div>
                </div>
              </div>

              {/* To-Do List */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <LayoutList className="w-5 h-5 text-indigo-500" />
                    To-Do List
                  </h3>
                  {selectedUser.todo && (
                    <span className="text-xs font-medium bg-white px-2 py-1 rounded border border-gray-200 text-gray-500">
                      {new Date(selectedUser.todo.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="p-5 bg-white">
                  {!selectedUser.todo ? (
                    <p className="text-sm text-red-500 font-medium py-4 text-center">No To-Do list submitted for this day.</p>
                  ) : (
                    <ul className="space-y-3">
                      {selectedUser.todo.items.map((item, idx) => (
                        <li key={idx} className="flex gap-3 items-start text-sm text-gray-700 bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                          <span className="text-indigo-400 shrink-0 mt-0.5 font-bold">{idx + 1}.</span>
                          <span className="leading-relaxed">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* EOD Report */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Check className="w-5 h-5 text-emerald-500" />
                    End of Day Report
                  </h3>
                  {selectedUser.eod && (
                    <span className="text-xs font-medium bg-white px-2 py-1 rounded border border-gray-200 text-gray-500">
                      {new Date(selectedUser.eod.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="p-5 bg-white">
                  {!selectedUser.eod ? (
                    <p className="text-sm text-gray-400 font-medium py-4 text-center">EOD Report not yet submitted.</p>
                  ) : (
                    <div className="space-y-4">
                      {selectedUser.eod.hoursWorked && (
                        <div className="inline-block bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-sm font-bold border border-emerald-100">
                          Hours tracked: {selectedUser.eod.hoursWorked}h
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Summary</p>
                        <p className="text-sm text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-100 leading-relaxed">
                          {selectedUser.eod.summary || "No summary provided."}
                        </p>
                      </div>
                      
                      {selectedUser.eod.completedItems && selectedUser.eod.completedItems.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Completed Tasks</p>
                          <ul className="space-y-2">
                            {selectedUser.eod.completedItems.map((item, i) => (
                              <li key={i} className="flex gap-2 items-start text-sm text-gray-700">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
