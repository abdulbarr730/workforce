import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { CheckCircle2, Clock, Plus, Trash2, X, AlertCircle } from "lucide-react";

export const formatToHHMM = (val: string) => {
  if (!val) return val;
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (val.includes(":")) return val;
  if (val.toLowerCase().includes("h") || val.toLowerCase().includes("m"))
    return val;

  const totalMinutes = Math.round(num * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

interface TaskItem {
  id: string;
  text: string;
  timeTaken: string;
  isTopTask?: boolean;
  done: boolean;
}

interface CheckinModalProps {
  token: string;
  intervalLabel: string;
  onClose: () => void;
  onSnooze: () => void;
  onSubmitted?: () => void;
}

export const CheckinModal: React.FC<CheckinModalProps> = ({
  token,
  intervalLabel,
  onClose,
  onSnooze,
  onSubmitted,
}) => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 4000);
  };

  useEffect(() => {
    const fetchTodayTasks = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_BASE_URL}/me/todos/today`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const existing = res.data?.data?.items;
        if (Array.isArray(existing) && existing.length > 0) {
          setTasks(
            existing.map((t: any) => ({
              id: crypto.randomUUID(),
              text: t.text || "",
              timeTaken:
                t.timeTaken ||
                t.estimatedTime ||
                (existing.length === 1 ? intervalLabel || "2h" : ""),
              isTopTask: !!t.isTopTask,
              done: !!t.done,
            })),
          );
        } else {
          setTasks([
            {
              id: crypto.randomUUID(),
              text: "",
              timeTaken: intervalLabel || "2h",
              isTopTask: true,
              done: false,
            },
          ]);
        }
      } catch {
        setTasks([
          {
            id: crypto.randomUUID(),
            text: "",
            timeTaken: intervalLabel || "2h",
            isTopTask: true,
            done: false,
          },
        ]);
      }
    };
    fetchTodayTasks();
  }, [token, intervalLabel]);

  const handleToggleDone = (index: number) => {
    setTasks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], done: !next[index].done };
      return next;
    });
  };

  const handleUpdateText = (index: number, text: string) => {
    setTasks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text };
      return next;
    });
  };

  const handleUpdateTime = (index: number, timeTaken: string) => {
    setTasks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], timeTaken };
      return next;
    });
  };

  const handleAddRow = () => {
    setTasks((prev) => {
      const next = [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: "",
          timeTaken: "",
          isTopTask: false,
          done: false,
        },
      ];
      setTimeout(() => {
        if (inputRefs.current[next.length - 1]) {
          inputRefs.current[next.length - 1]?.focus();
        }
      }, 50);
      return next;
    });
  };

  const handleRemoveRow = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const valid = tasks.filter((t) => t.text.trim().length > 0);
    if (valid.length === 0) {
      return showError("Please list at least one task you worked on.");
    }

    // Check mandatory duration for ALL tasks
    const missingDuration = valid.some(
      (t) => !t.timeTaken || t.timeTaken.trim() === "",
    );
    if (missingDuration) {
      return showError(
        "Time duration is mandatory for all tasks! (e.g. 1h 30m, 45m, 2h)",
      );
    }

    const completedTaskTexts = valid
      .filter((t) => t.done)
      .map((t) => `${t.text} (${t.timeTaken.trim()})`);

    setLoading(true);
    try {
      await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/me/todos/checkin`,
        {
          interval: intervalLabel,
          completedTasks: completedTaskTexts,
          notes,
          timeSpent: valid
            .map((t) => `${t.text}: ${t.timeTaken}`)
            .join(", "),
          items: valid.map((t) => ({
            text: t.text.trim(),
            timeTaken: t.timeTaken.trim(),
            isTopTask: !!t.isTopTask,
            done: t.done,
          })),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      // Automatically sync completed items into the EOD draft with timestamps
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        const existingDraftStr = localStorage.getItem("eod_draft_v2");
        let draftRows: any[] = [];
        if (existingDraftStr) {
          const parsed = JSON.parse(existingDraftStr);
          if (parsed.date === todayStr && Array.isArray(parsed.rows)) {
            draftRows = parsed.rows.filter(
              (r: any) => r.task && r.task.trim() !== "",
            );
          }
        }
        valid.forEach((t) => {
          const stampedTask = intervalLabel
            ? `${t.text.trim()} (${intervalLabel})`
            : t.text.trim();
          const alreadyExists = draftRows.some(
            (r: any) =>
              r.task === stampedTask || r.task.startsWith(t.text.trim()),
          );
          if (!alreadyExists) {
            draftRows.push({
              id: crypto.randomUUID(),
              task: stampedTask,
              hours: formatToHHMM(t.timeTaken) || "02:00",
              isTopTask: !!t.isTopTask,
            });
          }
        });
        if (draftRows.length > 0) {
          localStorage.setItem(
            "eod_draft_v2",
            JSON.stringify({ date: todayStr, rows: draftRows }),
          );
        }
      } catch (e) {
        console.error("Failed to sync checkin to EOD draft", e);
      }

      if (onSubmitted) onSubmitted();
      onClose();
    } catch (err: any) {
      showError(
        err?.response?.data?.message ||
          "Failed to save check-in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  2-Hour Work Check-in
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {intervalLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Quickly update what you worked on during the last 2 hours.
              </p>
            </div>
          </div>
          <button
            onClick={onSnooze}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Remind in 10 mins"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-red-400 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Tasks Worked On
                <span className="text-amber-400 ml-1.5 font-normal text-[11px]">
                  (Time duration is mandatory for all tasks)
                </span>
              </label>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Add Task
              </button>
            </div>

            <div className="space-y-2">
              {tasks.map((task, idx) => (
                <div
                  key={task.id || idx}
                  className={`flex items-center gap-2 p-2 rounded-xl border transition ${
                    task.done
                      ? "bg-emerald-950/20 border-emerald-500/30"
                      : "bg-slate-900/80 border-slate-800 focus-within:border-indigo-500/50"
                  }`}
                >
                  {/* Done checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggleDone(idx)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition flex-shrink-0 ${
                      task.done
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                    }`}
                    title={
                      task.done ? "Mark as in-progress" : "Mark as completed"
                    }
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>

                  {/* Task description */}
                  <input
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    value={task.text}
                    onChange={(e) => handleUpdateText(idx, e.target.value)}
                    placeholder="Task description (e.g., Finished CRM Webhook API)"
                    className={`flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none ${
                      task.done ? "line-through text-slate-400" : ""
                    }`}
                  />

                  {/* Timing / Duration */}
                  <div className="flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-700/60 flex-shrink-0">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <input
                      type="text"
                      value={task.timeTaken}
                      onChange={(e) => handleUpdateTime(idx, e.target.value)}
                      placeholder="e.g. 10:00-11:15 *"
                      title="Enter exact timing (e.g. 10:00 - 11:30) or duration (e.g. 45m, 1h 30m)"
                      className="w-32 bg-transparent text-xs text-amber-300 font-medium placeholder-slate-500 focus:outline-none text-center"
                    />
                  </div>

                  {/* Delete button */}
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Progress Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Quick Notes / Next Focus
              <span className="text-slate-500 ml-1 font-normal text-[11px]">
                (Optional)
              </span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What are you working on next or any blockers..."
              className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/60">
          <button
            type="button"
            onClick={onSnooze}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Remind in 10 mins
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-500/25 transition disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Progress & Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
