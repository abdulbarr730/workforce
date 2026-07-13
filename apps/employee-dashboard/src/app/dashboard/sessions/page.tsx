"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatDate, formatMinutes } from "@/lib/utils";
import { Clock } from "lucide-react";

interface WorkSession {
  _id: string;
  sessionId: string;
  loginTime: string;
  logoutTime?: string;
  status: string;
  todos: string[];
  eodReport?: {
    completedTasks: string[];
    pendingTasks: string[];
    blockers: string[];
  };
}

export default function WorkSessionsPage() {
  const { user } = useAuthStore();

  const { data: activeSession } = useQuery({
    queryKey: ["my-session"],
    queryFn: () =>
      api.get("/api/work-sessions/active").then((r) => r.data.data),
    enabled: !!user,
  });

  const statusColor: Record<string, string> = {
    ACTIVE: "bg-green-50 text-green-700",
    COMPLETED: "bg-gray-100 text-gray-600",
    CRASHED: "bg-red-50 text-red-700",
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Work Sessions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your daily work session history
        </p>
      </div>

      {activeSession ? (
        <div className="bg-white rounded-xl border border-green-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-gray-900">
              Active Session
            </h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Started</span>
              <span className="text-gray-900">
                {formatDate(activeSession.loginTime)} at{" "}
                {new Date(activeSession.loginTime).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {activeSession.todos?.length > 0 && (
              <div>
                <p className="text-gray-500 mb-2">Today&apos;s goals</p>
                <ul className="space-y-1.5">
                  {activeSession.todos.map((t: string, i: number) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-gray-700"
                    >
                      <span className="text-gray-400 mt-0.5">•</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6 flex flex-col items-center text-center">
          <Clock className="w-8 h-8 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">
            No active session. Start the desktop agent to begin your workday.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Recent Sessions
          </h2>
        </div>
        <div className="p-4 text-center text-sm text-gray-400">
          Session history is tracked by the desktop agent and processed nightly.
        </div>
      </div>
    </div>
  );
}
