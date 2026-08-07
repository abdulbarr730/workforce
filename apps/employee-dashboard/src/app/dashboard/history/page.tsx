"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatDate } from "@/lib/utils";
import {
  Clock,
  CheckSquare,
  FileText,
  Edit2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { TodoModal } from "@/components/daily-flow/TodoModal";
import { EodModal } from "@/components/daily-flow/EodModal";
import { EodReportDetails } from "@/components/daily-flow/EodReportDetails";

export default function HistoryPage() {
  const { user } = useAuthStore();

  const [activeTodoSession, setActiveTodoSession] = useState<any | null>(null);
  const [activeEodSession, setActiveEodSession] = useState<any | null>(null);

  const { data: sessions, refetch } = useQuery({
    queryKey: ["history-sessions"],
    queryFn: () =>
      api.get("/api/work-sessions/history").then((r) => r.data.data),
    enabled: !!user,
  });

  const handleEditTodo = (session: any) => {
    const isToday = session.loginAt.startsWith(
      new Date().toISOString().split("T")[0],
    );
    if (!isToday && session.isMissedTodo) {
      alert("Missed TODOs can only be filled once and cannot be edited again.");
      return;
    }
    if (!isToday && session.todoEditCount >= 1 && session.todoList.length > 0) {
      alert("Maximum edit limit (1) reached for this TODO.");
      return;
    }
    setActiveTodoSession(session);
  };

  const handleEditEod = (session: any) => {
    const isToday = session.loginAt.startsWith(
      new Date().toISOString().split("T")[0],
    );
    if (!isToday && session.isMissedEod) {
      alert("Missed EODs can only be filled once and cannot be edited again.");
      return;
    }
    if (!isToday && session.eodEditCount >= 1 && session.eodReport) {
      alert("Maximum edit limit (1) reached for this EOD.");
      return;
    }
    setActiveEodSession(session);
  };

  const createTodoSubmitFn = (session: any) => async (validTasks: any[]) => {
    const wasEmpty = !session.todoList || session.todoList.length === 0;

    let reason = "";
    if (!wasEmpty) {
      reason =
        window.prompt("Please provide a reason for editing this TODO:") || "";
      if (!reason.trim()) {
        throw new Error("Reason is required to edit a TODO.");
      }
    }

    await api.post(`/api/work-sessions/${session._id}/edit-todo`, {
      id: session._id,
      todoList: validTasks.map((t) => t.text),
      todoItems: validTasks,
      reason,
    });
  };

  const createEodSubmitFn = (session: any) => async (data: any) => {
    const wasEmpty = !session.eodReport;

    let reason = "";
    if (!wasEmpty) {
      reason =
        window.prompt("Please provide a reason for editing this EOD:") || "";
      if (!reason.trim()) {
        throw new Error("Reason is required to edit an EOD.");
      }
    }

    await api.post(`/api/work-sessions/${session._id}/edit-eod`, {
      id: session._id,
      eodReport: data.summary,
      completedItems: data.completedItems,
      tasksWithTimings: data.tasksWithTimings,
      top3Tasks: data.top3Tasks,
      reason,
    });
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="mb-10 text-center sm:text-left">
        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
          <Calendar className="w-8 h-8 text-blue-500" />
          My Daily Logs
        </h1>
        <p className="text-slate-500 mt-2 text-lg max-w-2xl">
          Review your historic activity, edit past submissions, and track your
          daily progress.
        </p>
      </div>

      <div className="space-y-8">
        {sessions?.map((session: any) => {
          const isToday = session.loginAt.startsWith(
            new Date().toISOString().split("T")[0],
          );
          const todoEmpty = !session.todoList || session.todoList.length === 0;
          const eodEmpty = !session.eodReport;
          const canEditTodo =
            isToday ||
            (!session.isMissedTodo && (todoEmpty || session.todoEditCount < 1));
          const canEditEod =
            isToday ||
            (!session.isMissedEod && (eodEmpty || session.eodEditCount < 1));

          return (
            <div
              key={session._id}
              className="bg-white rounded-2xl border border-slate-200/60 p-7 shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 p-2 rounded-lg">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="font-bold text-slate-800 text-lg">
                    {formatDate(session.loginAt.split("T")[0])}
                  </span>
                  {isToday && (
                    <span className="text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">
                      Today
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* TODO Section */}
                <div className="flex flex-col h-full bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-white shadow-sm p-1.5 rounded-md">
                        <CheckSquare className="w-4 h-4 text-slate-500" />
                      </div>
                      <h3 className="text-base font-bold text-slate-800">
                        To-Do List
                      </h3>
                    </div>
                    {canEditTodo && (
                      <button
                        onClick={() => handleEditTodo(session)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}
                  </div>

                  <div className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
                    {todoEmpty ? (
                      <div className="h-full flex items-center justify-center py-6 text-slate-400 italic text-sm">
                        No tasks recorded for this day.
                      </div>
                    ) : (
                      <ul className="text-sm text-slate-700 space-y-2.5">
                        {session.todoList.map((t: string, i: number) => {
                          let taskText = t;
                          let duration = "";

                          const dashMatch = t.match(/^(.*)\s+-\s+(.*?)$/);
                          if (dashMatch) {
                            taskText = dashMatch[1].trim();
                            duration = dashMatch[2].trim();
                          } else {
                            const parenMatch = t.match(/^(.*)\s+\((.*?)\)$/);
                            if (parenMatch) {
                              taskText = parenMatch[1].trim();
                              duration = parenMatch[2].trim();
                            }
                          }

                          return (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="text-blue-500 font-bold text-xs mt-0.5 shrink-0">
                                  #{i + 1}
                                </span>
                                <span className="font-medium text-slate-800 break-words">
                                  {taskText}
                                </span>
                              </div>
                              {duration && (
                                <span className="shrink-0 font-mono text-xs font-semibold bg-white text-blue-700 border border-slate-200 px-2 py-0.5 rounded shadow-2xs">
                                  {duration}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    {!isToday && !todoEmpty && !session.isMissedTodo && (
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                        Edits left: {1 - (session.todoEditCount || 0)}
                      </span>
                    )}
                    {!isToday && session.isMissedTodo && (
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-md flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Missed TODO filled
                      </span>
                    )}
                  </div>
                </div>

                {/* EOD Section */}
                <div className="flex flex-col h-full bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-white shadow-sm p-1.5 rounded-md">
                        <FileText className="w-4 h-4 text-slate-500" />
                      </div>
                      <h3 className="text-base font-bold text-slate-800">
                        EOD Report
                      </h3>
                    </div>
                    {canEditEod && (
                      <button
                        onClick={() => handleEditEod(session)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}
                  </div>

                  <div className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
                    {eodEmpty ? (
                      <div className="h-full flex items-center justify-center py-6 text-slate-400 italic text-sm">
                        No EOD report submitted for this day.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <EodReportDetails
                          compact
                          report={{
                            summary: session.eodReport,
                            completedItems: session.eodCompletedItems,
                            tasksWithTimings: session.eodTasksWithTimings,
                            top3Tasks: session.eodTop3Tasks,
                            hoursWorked: session.eodHoursWorked,
                            submittedAt: session.eodSubmittedAt,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    {!isToday && !eodEmpty && !session.isMissedEod && (
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                        Edits left: {1 - (session.eodEditCount || 0)}
                      </span>
                    )}
                    {!isToday && session.isMissedEod && (
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-md flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Missed EOD filled
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {sessions?.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/60 shadow-sm">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg font-medium">
              No session history found yet.
            </p>
            <p className="text-slate-400 text-sm mt-1">
              Your daily logs will appear here once you start submitting them.
            </p>
          </div>
        )}
      </div>

      {activeTodoSession && (
        <TodoModal
          date={activeTodoSession.loginAt.split("T")[0]}
          initialTasks={activeTodoSession.todoList}
          onSaved={() => {
            setActiveTodoSession(null);
            refetch();
          }}
          customSubmitFn={createTodoSubmitFn(activeTodoSession)}
        />
      )}

      {activeEodSession && (
        <EodModal
          date={activeEodSession.loginAt.split("T")[0]}
          initialData={{
            summary: activeEodSession.eodReport,
            completedItems: activeEodSession.eodCompletedItems,
            tasksWithTimings: activeEodSession.eodTasksWithTimings,
            top3Tasks: activeEodSession.eodTop3Tasks,
          }}
          onClose={() => setActiveEodSession(null)}
          onSubmitted={() => {
            setActiveEodSession(null);
            refetch();
          }}
          customSubmitFn={createEodSubmitFn(activeEodSession)}
        />
      )}
    </div>
  );
}
