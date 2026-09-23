import React, { useEffect, useState } from "react";
import axios from "axios";
import { Bell, Calendar, CheckCircle2, ExternalLink, Sparkles, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const API =
  import.meta.env.VITE_API_BASE_URL || "https://api.prosyncedu.com/api";

export interface PersistentAlertItem {
  id: string;
  title: string;
  body: string;
  type?: "reminder" | "crm" | "assigned_task";
  action?: string;
  meta?: {
    queryId?: string;
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string;
    crmUrl?: string;
    taskId?: string;
    todoId?: string;
    itemIndex?: number;
    scheduledFor?: string;
    text?: string;
    dismissalKey?: string;
  };
}

export const PersistentNotificationOverlay: React.FC = () => {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<PersistentAlertItem[]>([]);
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Electron IPC Listener
    const electronApi = (window as any).electronAPI;
    if (electronApi?.onPersistentAlert) {
      electronApi.onPersistentAlert((data: any) => {
        if (!data || !data.title) return;
        const newAlert: PersistentAlertItem = {
          id: data.id || `alert-${Date.now()}-${Math.random()}`,
          title: data.title,
          body: data.body || "",
          type: data.type || "reminder",
          action: data.action,
          meta: data.meta,
        };
        setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
      });
    }

    // 2. Custom DOM Window Event Listener for in-app triggers
    const handleCustomAlert = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !detail.title) return;
      const newAlert: PersistentAlertItem = {
        id: detail.id || `alert-${Date.now()}-${Math.random()}`,
        title: detail.title,
        body: detail.body || "",
        type: detail.type || "reminder",
        action: detail.action,
        meta: detail.meta,
      };
      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
    };

    window.addEventListener("trigger-persistent-alert" as any, handleCustomAlert);
    return () => {
      window.removeEventListener("trigger-persistent-alert" as any, handleCustomAlert);
    };
  }, []);

  const handleDismiss = (id: string) => {
    const alert = alerts.find((item) => item.id === id);
    if (alert?.meta?.dismissalKey) {
      localStorage.setItem(alert.meta.dismissalKey, "true");
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleView = (alert: PersistentAlertItem) => {
    // Dismiss the alert card
    handleDismiss(alert.id);

    // Perform action
    if (alert.meta?.crmUrl) {
      window.open(alert.meta.crmUrl, "_blank");
    }

    if (alert.action === "navigate:assigned-tasks" || alert.type === "crm" || alert.type === "assigned_task") {
      window.dispatchEvent(new CustomEvent("navigate", { detail: "assigned-tasks" }));
      window.dispatchEvent(new CustomEvent("assigned-tasks-updated"));
    } else if (alert.action === "navigate:schedule") {
      sessionStorage.setItem(
        "scheduled-calendar-focus",
        JSON.stringify({
          date: alert.meta?.scheduledFor,
          taskId: alert.meta?.taskId,
          todoId: alert.meta?.todoId,
        }),
      );
      window.location.hash = "/schedule";
      window.dispatchEvent(new CustomEvent("scheduled-calendar-focus"));
    } else if (alert.action === "navigate:todos" || alert.type === "reminder") {
      window.dispatchEvent(new CustomEvent("navigate", { detail: "dashboard" }));
      window.dispatchEvent(new CustomEvent("open-todo-modal"));
    }
  };

  const handleMarkCompleted = async (alert: PersistentAlertItem) => {
    const todoId = alert.meta?.todoId;
    const taskPath =
      alert.meta?.taskId || String(alert.meta?.itemIndex ?? "");
    if (!token || !todoId || !taskPath) return;

    setCompletingId(alert.id);
    const completedAt = new Date().toISOString();
    try {
      await axios.put(
        `${API}/me/todos/${todoId}/items/${encodeURIComponent(taskPath)}`,
        {
          text: alert.meta?.text || alert.body || alert.title,
          scheduledFor: alert.meta?.scheduledFor,
          done: true,
          completedAt,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      window.dispatchEvent(
        new CustomEvent("scheduled-task-completed", {
          detail: {
            todoId,
            taskId: alert.meta?.taskId,
            itemIndex: alert.meta?.itemIndex,
            completedAt,
          },
        }),
      );
      try {
        localStorage.setItem("todo-widget-refresh", String(Date.now()));
      } catch {
        // no-op
      }
      handleDismiss(alert.id);
    } catch {
      setCompletingId(null);
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-3 max-w-md w-full pointer-events-none p-2">
      {alerts.map((alert) => {
        const isCrm = alert.type === "crm" || alert.title.toLowerCase().includes("crm");
        const isTask = alert.type === "assigned_task" || alert.title.toLowerCase().includes("assigned");
        const isReminder = !isCrm && !isTask;
        const canComplete =
          isReminder && Boolean(alert.meta?.todoId) && Boolean(alert.meta?.taskId || alert.meta?.itemIndex !== undefined);

        return (
          <div
            key={alert.id}
            className={`pointer-events-auto rounded-2xl shadow-2xl border p-4 transition-all duration-300 transform animate-in slide-in-from-top-5 ${
              isCrm
                ? "bg-slate-900 border-indigo-500/50 text-white shadow-indigo-900/30"
                : isTask
                  ? "bg-slate-900 border-emerald-500/50 text-white shadow-emerald-900/30"
                  : "bg-white border-blue-200 text-slate-950 shadow-blue-900/20"
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`p-2 rounded-xl text-lg font-bold flex items-center justify-center ${
                    isCrm
                      ? "bg-indigo-600/30 text-indigo-300"
                      : isTask
                        ? "bg-emerald-600/30 text-emerald-300"
                        : "bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-700/25"
                  }`}
                >
                  {isCrm ? <Bell className="w-5 h-5" /> : isTask ? <Calendar className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                </span>
                <div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isCrm
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-400/30"
                        : isTask
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                          : "bg-blue-50 text-blue-700 border border-blue-100"
                    }`}
                  >
                    {isCrm ? "CRM Query Transferred" : isTask ? "Assigned Task" : "ProSync Reminder"}
                  </span>
                  <h4 className="font-bold text-sm mt-0.5 leading-snug">{alert.title}</h4>
                </div>
              </div>

              <button
                onClick={() => handleDismiss(alert.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="Close Alert"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="mt-2 text-xs leading-relaxed opacity-90 pl-1 font-medium">
              <p className="whitespace-normal break-words">{alert.body}</p>

              {/* Extra details for CRM Queries */}
              {alert.meta && (alert.meta.clientName || alert.meta.clientPhone || alert.meta.queryId) && (
                <div className="mt-2 pt-2 border-t border-slate-700/50 grid grid-cols-2 gap-1 text-[11px]">
                  {alert.meta.queryId && (
                    <div>
                      <span className="opacity-60">Query ID:</span> <span className="font-semibold">{alert.meta.queryId}</span>
                    </div>
                  )}
                  {alert.meta.clientName && (
                    <div>
                      <span className="opacity-60">Client:</span> <span className="font-semibold">{alert.meta.clientName}</span>
                    </div>
                  )}
                  {alert.meta.clientPhone && (
                    <div>
                      <span className="opacity-60">Phone:</span> <span className="font-semibold">{alert.meta.clientPhone}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons (DOES NOT AUTO-CLOSE - STAYS UNTIL CLICKED) */}
            <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-slate-700/30">
              <button
                onClick={() => handleDismiss(alert.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isCrm || isTask
                    ? "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Cancel
              </button>
              {canComplete && (
                <button
                  onClick={() => void handleMarkCompleted(alert)}
                  disabled={completingId === alert.id}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {completingId === alert.id ? "Completing..." : "Mark completed"}
                </button>
              )}
              <button
                onClick={() => handleView(alert)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 ${
                  isCrm
                    ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/40"
                    : isTask
                      ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/40"
                      : "bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/40"
                }`}
              >
                {alert.meta?.crmUrl ? <ExternalLink className="w-3.5 h-3.5" /> : null}
                {isCrm ? "See Query" : "View"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
