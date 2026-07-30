"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AlertCircle, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { EodModal } from "./EodModal";
import { TodoModal } from "./TodoModal";

export function MissedTasksAlert() {
  const { data: missedTasks } = useQuery({
    queryKey: ["missed-tasks"],
    queryFn: () => api.get("/api/me/missed-tasks").then((r) => r.data.data),
  });

  const [activeModal, setActiveModal] = useState<{ type: "TODO" | "EOD", date: string } | null>(null);

  if (!missedTasks || missedTasks.length === 0) return null;

  return (
    <>
      <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-4 shadow-sm animate-in fade-in slide-in-from-top-4">
        <div className="bg-red-100 p-2 rounded-full flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-red-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900">Action Required: Missed Submissions</h3>
          <p className="text-sm text-red-700 mt-1">
            You have {missedTasks.length} day(s) with missing EOD or Todo submissions. 
            Please fill them in to maintain your attendance streak.
          </p>
          <div className="mt-3 space-y-2">
            {missedTasks.map((task: any) => (
              <div key={task.date} className="flex items-center justify-between bg-white/60 p-2 rounded-lg text-sm">
                <span className="font-medium text-gray-900">{formatDate(task.date)}</span>
                <div className="flex space-x-2">
                  {task.missedTodo && (
                    <button 
                      onClick={() => setActiveModal({ type: "TODO", date: task.date })}
                      className="bg-red-100 hover:bg-red-200 transition-colors text-red-700 px-2 py-0.5 rounded text-xs font-semibold flex items-center cursor-pointer"
                    >
                      Fill Missed Todo <ChevronRight className="w-3 h-3 ml-1" />
                    </button>
                  )}
                  {task.missedEod && (
                    <button 
                      onClick={() => setActiveModal({ type: "EOD", date: task.date })}
                      className="bg-red-100 hover:bg-red-200 transition-colors text-red-700 px-2 py-0.5 rounded text-xs font-semibold flex items-center cursor-pointer"
                    >
                      Fill Missed EOD <ChevronRight className="w-3 h-3 ml-1" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {activeModal?.type === "TODO" && (
        <TodoModal 
          date={activeModal.date}
          onSaved={() => setActiveModal(null)} 
        />
      )}
      
      {activeModal?.type === "EOD" && (
        <EodModal 
          date={activeModal.date}
          title={`Missed EOD (${formatDate(activeModal.date)})`}
          subtitle="Please fill out your End of Day report for this missed date."
          onClose={() => setActiveModal(null)}
          onSubmitted={() => setActiveModal(null)} 
        />
      )}
    </>
  );
}
