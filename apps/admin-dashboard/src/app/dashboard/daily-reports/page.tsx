"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function DailyReportsPage() {
  const [dateInput, setDateInput] = useState(new Date().toISOString().split("T")[0]);

  // Use the admin routes (which require auth/roles)
  const { data: todos, isLoading: loadingTodos } = useQuery({
    queryKey: ["admin-todos", dateInput],
    queryFn: () => api.get(`/api/admin/todos?date=${dateInput}`).then((r) => r.data.data),
  });

  const { data: eods, isLoading: loadingEods } = useQuery({
    queryKey: ["admin-eods", dateInput],
    queryFn: () => api.get(`/api/admin/eod?date=${dateInput}`).then((r) => r.data.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Daily Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Review To-Do lists and EOD reports</p>
        </div>
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* To-Dos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            ☀️ Start of Day (To-Dos)
          </h2>
          {loadingTodos ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
          ) : !todos || todos.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
              No To-Do lists submitted for this date.
            </p>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {todos.map((todo: any, idx: number) => (
                <div key={idx} className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                    <div className="font-semibold text-gray-800">{todo.employeeId}</div>
                    <div className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-100">
                      {new Date(todo.updatedAt || todo.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {todo.items.map((item: any, i: number) => (
                      <li key={i} className="flex gap-2 items-start text-sm text-gray-700">
                        <span className="text-blue-500 shrink-0 mt-0.5">•</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* EODs */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            🌙 End of Day (EOD)
          </h2>
          {loadingEods ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
          ) : !eods || eods.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
              No EOD reports submitted for this date.
            </p>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {eods.map((eod: any, idx: number) => (
                <div key={idx} className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                    <div className="font-semibold text-gray-800">{eod.employeeId}</div>
                    <div className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-100">
                      {new Date(eod.submittedAt || eod.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <p className="text-sm text-gray-800 font-medium mb-2">{eod.summary}</p>
                  
                  {eod.completedItems && eod.completedItems.length > 0 && (
                    <ul className="space-y-1 mb-3">
                      {eod.completedItems.map((item: string, i: number) => (
                        <li key={i} className="flex gap-2 items-start text-xs text-gray-600">
                          <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {eod.hoursWorked && (
                    <div className="mt-3 inline-block bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                      Hours tracked: {eod.hoursWorked}h
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
