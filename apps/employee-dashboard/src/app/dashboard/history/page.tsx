"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatDate } from "@/lib/utils";
import { Clock, CheckSquare, FileText, Edit2, AlertCircle } from "lucide-react";

export default function HistoryPage() {
  const { user } = useAuthStore();
  const [editingTodo, setEditingTodo] = useState<string | null>(null);
  const [editingEod, setEditingEod] = useState<string | null>(null);
  
  const [todoInput, setTodoInput] = useState<string>("");
  const [eodInput, setEodInput] = useState<string>("");
  const [reasonInput, setReasonInput] = useState<string>("");

  const { data: sessions, refetch } = useQuery({
    queryKey: ["history-sessions"],
    queryFn: () => api.get("/api/work-sessions/history").then((r) => r.data.data),
    enabled: !!user,
  });

  const editTodoMutation = useMutation({
    mutationFn: (data: { id: string, todoList: string[], reason: string }) => 
      api.post(`/api/work-sessions/${data.id}/edit-todo`, data),
    onSuccess: () => {
      setEditingTodo(null);
      setReasonInput("");
      refetch();
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || "Failed to update TODO");
    }
  });

  const editEodMutation = useMutation({
    mutationFn: (data: { id: string, eodReport: string, reason: string }) => 
      api.post(`/api/work-sessions/${data.id}/edit-eod`, data),
    onSuccess: () => {
      setEditingEod(null);
      setReasonInput("");
      refetch();
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || "Failed to update EOD");
    }
  });

  const handleEditTodo = (session: any) => {
    const isToday = session.loginAt.startsWith(new Date().toISOString().split("T")[0]);
    if (!isToday && session.isMissedTodo) {
      alert("Missed TODOs can only be filled once and cannot be edited again.");
      return;
    }
    if (!isToday && session.todoEditCount >= 1 && session.todoList.length > 0) {
      alert("Maximum edit limit (1) reached for this TODO.");
      return;
    }
    setEditingTodo(session._id);
    setTodoInput(session.todoList.join("\n"));
    setReasonInput("");
  };

  const handleEditEod = (session: any) => {
    const isToday = session.loginAt.startsWith(new Date().toISOString().split("T")[0]);
    if (!isToday && session.isMissedEod) {
      alert("Missed EODs can only be filled once and cannot be edited again.");
      return;
    }
    if (!isToday && session.eodEditCount >= 1 && session.eodReport) {
      alert("Maximum edit limit (1) reached for this EOD.");
      return;
    }
    setEditingEod(session._id);
    setEodInput(session.eodReport || "");
    setReasonInput("");
  };

  const submitTodo = (session: any) => {
    const isToday = session.loginAt.startsWith(new Date().toISOString().split("T")[0]);
    const wasEmpty = !session.todoList || session.todoList.length === 0;
    
    if (!isToday && !wasEmpty && !reasonInput.trim()) {
      alert("Please provide a reason for editing a past TODO.");
      return;
    }
    
    editTodoMutation.mutate({
      id: session._id,
      todoList: todoInput.split("\n").filter(Boolean),
      reason: reasonInput
    });
  };

  const submitEod = (session: any) => {
    const isToday = session.loginAt.startsWith(new Date().toISOString().split("T")[0]);
    const wasEmpty = !session.eodReport;
    
    if (!isToday && !wasEmpty && !reasonInput.trim()) {
      alert("Please provide a reason for editing a past EOD.");
      return;
    }
    
    editEodMutation.mutate({
      id: session._id,
      eodReport: eodInput,
      reason: reasonInput
    });
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">My Daily Logs</h1>
        <p className="text-sm text-gray-500 mt-1">View and edit your past EODs and To-Do lists.</p>
      </div>

      <div className="space-y-6">
        {sessions?.map((session: any) => {
          const isToday = session.loginAt.startsWith(new Date().toISOString().split("T")[0]);
          const todoEmpty = !session.todoList || session.todoList.length === 0;
          const eodEmpty = !session.eodReport;
          const canEditTodo = isToday || (!session.isMissedTodo && (todoEmpty || session.todoEditCount < 1));
          const canEditEod = isToday || (!session.isMissedEod && (eodEmpty || session.eodEditCount < 1));

          return (
            <div key={session._id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-indigo-500" />
                  <span className="font-semibold text-gray-900">
                    {formatDate(session.loginAt.split("T")[0])}
                  </span>
                  {isToday && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Today</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* TODO Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-medium text-gray-900">To-Do List</h3>
                    </div>
                    {canEditTodo && editingTodo !== session._id && (
                      <button onClick={() => handleEditTodo(session)} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    )}
                  </div>
                  
                  {editingTodo === session._id ? (
                    <div className="space-y-3">
                      <textarea
                        className="w-full border rounded-lg p-2 text-sm"
                        rows={4}
                        value={todoInput}
                        onChange={e => setTodoInput(e.target.value)}
                        placeholder="Enter tasks, one per line..."
                      />
                      {!isToday && !todoEmpty && (
                        <input
                          type="text"
                          className="w-full border rounded-lg p-2 text-sm"
                          value={reasonInput}
                          onChange={e => setReasonInput(e.target.value)}
                          placeholder="Reason for editing past TODO..."
                        />
                      )}
                      {!isToday && todoEmpty && (
                        <div className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Missed TODOs can only be filled once.
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingTodo(null)} className="text-xs px-3 py-1.5 border rounded-lg">Cancel</button>
                        <button onClick={() => submitTodo(session)} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-3 min-h-[100px]">
                      {todoEmpty ? (
                        <p className="text-sm text-gray-400 italic">No tasks recorded.</p>
                      ) : (
                        <ul className="text-sm text-gray-700 space-y-1">
                          {session.todoList.map((t: string, i: number) => (
                            <li key={i}>• {t}</li>
                          ))}
                        </ul>
                      )}
                      {!isToday && !todoEmpty && !session.isMissedTodo && (
                        <p className="text-xs text-gray-400 mt-4">Edits left: {1 - (session.todoEditCount || 0)}</p>
                      )}
                      {!isToday && session.isMissedTodo && (
                        <p className="text-xs text-amber-600 mt-4 border border-amber-200 bg-amber-50 px-2 py-1 rounded inline-block">Missed TODO filled</p>
                      )}
                    </div>
                  )}
                </div>

                {/* EOD Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-medium text-gray-900">EOD Report</h3>
                    </div>
                    {canEditEod && editingEod !== session._id && (
                      <button onClick={() => handleEditEod(session)} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    )}
                  </div>

                  {editingEod === session._id ? (
                    <div className="space-y-3">
                      <textarea
                        className="w-full border rounded-lg p-2 text-sm"
                        rows={4}
                        value={eodInput}
                        onChange={e => setEodInput(e.target.value)}
                        placeholder="Enter your EOD report..."
                      />
                      {!isToday && !eodEmpty && (
                        <input
                          type="text"
                          className="w-full border rounded-lg p-2 text-sm"
                          value={reasonInput}
                          onChange={e => setReasonInput(e.target.value)}
                          placeholder="Reason for editing past EOD..."
                        />
                      )}
                      {!isToday && eodEmpty && (
                        <div className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Missed EODs can only be filled once.
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingEod(null)} className="text-xs px-3 py-1.5 border rounded-lg">Cancel</button>
                        <button onClick={() => submitEod(session)} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-3 min-h-[100px]">
                      {eodEmpty ? (
                        <p className="text-sm text-gray-400 italic">No EOD report submitted.</p>
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{session.eodReport}</p>
                      )}
                      {!isToday && !eodEmpty && !session.isMissedEod && (
                        <p className="text-xs text-gray-400 mt-4">Edits left: {1 - (session.eodEditCount || 0)}</p>
                      )}
                      {!isToday && session.isMissedEod && (
                        <p className="text-xs text-amber-600 mt-4 border border-amber-200 bg-amber-50 px-2 py-1 rounded inline-block">Missed EOD filled</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {sessions?.length === 0 && (
          <div className="text-center py-10 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">No session history found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
