"use client";
import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, CheckCircle, Copy, FileText, Upload, Clock } from "lucide-react";

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      {children}
    </div>
  );
}

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

export const parseTimeToMinutes = (val: string): number => {
  if (!val) return 0;
  let str = val.toLowerCase().trim();
  let totalMins = 0;

  if (str.includes("h") || str.includes("m")) {
    const hMatch = str.match(/([\d.]+)\s*h/);
    const mMatch = str.match(/([\d.]+)\s*m/);
    if (hMatch) totalMins += parseFloat(hMatch[1]) * 60;
    if (mMatch) totalMins += parseFloat(mMatch[1]);
    return Math.round(totalMins);
  }

  if (str.includes(":")) {
    const parts = str.split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return Math.round(h * 60 + m);
  }

  const num = parseFloat(str);
  if (!isNaN(num)) {
    return Math.round(num * 60);
  }
  return 0;
};

interface EodRow {
  id: string;
  interval?: string;
  task: string;
  hours: string;
  isTopTask?: boolean;
  sourceTodoText?: string;
}

type Props = {
  forceSubmit?: boolean;
  date?: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSubmitted: () => void;
  customSubmitFn?: (data: any) => Promise<any>;
  initialData?: any;
};

export function EodModal({ forceSubmit, date, title, subtitle, onClose, onSubmitted, customSubmitFn, initialData }: Props) {
  const qc = useQueryClient();
  const getTodayStr = () => new Date().toISOString().split("T")[0];

  const [rows, setRows] = useState<EodRow[]>([
    { id: crypto.randomUUID(), interval: "", task: "", hours: "", isTopTask: false },
  ]);

  const [loading, setLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [todoItems, setTodoItems] = useState<{ text: string }[]>([]);

  const taskRefs = useRef<(HTMLInputElement | null)[]>([]);
  const hoursRefs = useRef<(HTMLInputElement | null)[]>([]);
  const intervalRefs = useRef<(HTMLInputElement | null)[]>([]);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
  };

  useEffect(() => {
    if (!date || date === getTodayStr()) {
      const saved = localStorage.getItem("eod_draft_web_v2");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.date === getTodayStr() && Array.isArray(parsed.rows)) {
            setRows(
              parsed.rows.map((r: any) => ({
                ...r,
                id: r.id || crypto.randomUUID(),
                interval: r.interval || "",
                hours: formatToHHMM(r.hours || ""),
                isTopTask: !!r.isTopTask,
                sourceTodoText: r.sourceTodoText,
              }))
            );
          }
        } catch (e) {}
      }
    }
  }, [date]);

  useEffect(() => {
    if (!date || date === getTodayStr()) {
      localStorage.setItem("eod_draft_web_v2", JSON.stringify({ date: getTodayStr(), rows }));
    }
  }, [rows, date]);

  useEffect(() => {
    const fetchExisting = async () => {
      if (initialData) {
        const items = initialData.completedItems as string[] || [];
        const top3 = initialData.top3Tasks || [];
        const newRows = items.map((item) => {
          let taskObj: any = { task: item, hours: "", isTopTask: false, interval: "" };
          const stampMatch = item.match(/^(.*?)\s*\(([^)]*(?:\d{1,2}:\d{2}|AM|PM|–|-)[^)]*)\)\s*-\s*(.*?)$/i);
          if (stampMatch) {
            taskObj.task = stampMatch[1].trim();
            taskObj.interval = stampMatch[2].trim();
            taskObj.hours = stampMatch[3].trim();
            taskObj.isTopTask = top3.includes(taskObj.task);
          } else {
            const oldMatch = item.match(/^(.*) \(([\d.]+)h\)$/);
            if (oldMatch) {
              taskObj = { task: oldMatch[1], hours: oldMatch[2], isTopTask: top3.includes(oldMatch[1]), interval: "" };
            } else {
              const newMatch = item.match(/^(.*) - (.*)$/);
              if (newMatch) {
                taskObj = { task: newMatch[1], hours: newMatch[2], isTopTask: top3.includes(newMatch[1]), interval: "" };
              } else {
                taskObj.isTopTask = top3.includes(item);
              }
            }
          }
          return { ...taskObj, id: crypto.randomUUID() };
        });
        if (newRows.length > 0) {
          setRows(newRows);
        } else {
          setRows([{ id: crypto.randomUUID(), interval: "", task: "", hours: "", isTopTask: false }]);
        }
        return;
      }

      if (!date) {
        try {
          const res = await api.get("/api/daily-flow/me/eod/today");
          if (res.data?.data?.completedItems) {
            const items = res.data.data.completedItems as string[];
            const top3 = res.data.data.top3Tasks || [];
            const newRows = items.map((item) => {
              let taskObj: any = { task: item, hours: "", isTopTask: false, interval: "" };
              const stampMatch = item.match(/^(.*?)\s*\(([^)]*(?:\d{1,2}:\d{2}|AM|PM|–|-)[^)]*)\)\s*-\s*(.*?)$/i);
              if (stampMatch) {
                taskObj.task = stampMatch[1].trim();
                taskObj.interval = stampMatch[2].trim();
                taskObj.hours = stampMatch[3].trim();
                taskObj.isTopTask = top3.includes(taskObj.task);
              } else {
                const newMatch = item.match(/^(.*) - (.*)$/);
                if (newMatch) {
                  taskObj = { task: newMatch[1], hours: newMatch[2], isTopTask: top3.includes(newMatch[1]), interval: "" };
                } else {
                  taskObj.isTopTask = top3.includes(item);
                }
              }
              return { ...taskObj, id: crypto.randomUUID() };
            });
            if (newRows.length > 0) setRows(newRows);
          }
        } catch (err) {}
      }

      try {
        const todoRes = await api.get("/api/daily-flow/me/todo/today");
        if (todoRes.data?.data?.items) {
          setTodoItems(todoRes.data.data.items);
        }
      } catch (err) {}
    };
    fetchExisting();
  }, [date]);

  const handleAddRow = () => {
    setRows((prev) => {
      const next = [...prev, { id: crypto.randomUUID(), interval: "", task: "", hours: "", isTopTask: false }];
      setTimeout(() => {
        if (taskRefs.current[next.length - 1]) {
          taskRefs.current[next.length - 1]?.focus();
        }
      }, 10);
      return next;
    });
  };

  const handleReset = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 3000);
      return;
    }
    setRows([{ id: crypto.randomUUID(), interval: "", task: "", hours: "", isTopTask: false }]);
    if (!date || date === getTodayStr()) {
      localStorage.removeItem("eod_draft_web_v2");
    }
    setResetConfirm(false);
  };

  const handleUpdate = (index: number, field: keyof EodRow, value: any) => {
    const newRows = [...rows];
    if (field === "isTopTask" && value === true) {
      const topCount = newRows.filter((r) => r.isTopTask).length;
      if (topCount >= 3) {
        showError("You can only select up to 3 top tasks.");
        return;
      }
    }
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const combineTasks = (prevRows: any[], newRows: any[]) => {
    const validPrev = prevRows.filter((p) => p.task.trim() !== "");
    return [...validPrev, ...newRows.map((r) => ({ ...r, id: crypto.randomUUID() }))];
  };

  const processTableData = (text: string) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 1) return;

    const parsedRows = lines
      .map((line) => {
        let cols = line.split("\t");
        if (cols.length < 2) {
          cols = line.split(/ {2,}/);
        }
        if (cols.length >= 3) {
          const intervalPart = cols[0].trim();
          const taskPart = cols.slice(1, cols.length - 1).join(" ").trim();
          const hoursPart = formatToHHMM(cols[cols.length - 1].trim());
          return { interval: intervalPart, task: taskPart, hours: hoursPart };
        } else if (cols.length === 2) {
          const hoursPart = formatToHHMM(cols[cols.length - 1].trim());
          const taskPart = cols[0].trim();
          return { interval: "", task: taskPart, hours: hoursPart };
        } else if (cols.length === 1) {
          return { interval: "", task: cols[0].trim(), hours: "" };
        }
        return null;
      })
      .filter((r) => r && r.task) as { interval: string; task: string; hours: string }[];

    if (parsedRows.length > 0) {
      if (
        parsedRows[0].task.toLowerCase() === "task" ||
        parsedRows[0].task.toLowerCase() === "description"
      ) {
        parsedRows.shift();
      }
      setRows((prev) => combineTasks(prev, parsedRows));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("Text");
    if (text) {
      e.preventDefault();
      processTableData(text);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const text = e.dataTransfer.getData("Text");
    if (text) processTableData(text);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      hoursRefs.current[index]?.focus();
    }
  };

  const handleHoursKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index === rows.length - 1) {
        handleAddRow();
      } else {
        taskRefs.current[index + 1]?.focus();
      }
    }
  };

  const submit = useMutation({
    mutationFn: customSubmitFn || ((data: any) => api.post("/api/daily-flow/me/eod", data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-today-eod"] });
      qc.invalidateQueries({ queryKey: ["my-today-todo"] });
      qc.invalidateQueries({ queryKey: ["missed-tasks"] });
      qc.invalidateQueries({ queryKey: ["team-missed-tasks"] });
      
      if (!date || date === getTodayStr()) {
        localStorage.removeItem("eod_draft_web_v2");
      }
      setSubmitConfirm(false);
      onSubmitted();
    },
    onError: () => showError("Failed to submit EOD"),
  });

  const handleSubmit = () => {
    const valid = rows.filter((r) => r.task.trim().length > 0);
    if (valid.length === 0) return showError("Please enter at least one task");

    if (!submitConfirm) {
      setSubmitConfirm(true);
      setTimeout(() => setSubmitConfirm(false), 3000);
      return;
    }

    const completedItems = valid.map((r) => {
      const stamp = r.interval && r.interval.trim() !== "" ? `(${r.interval.trim()}) ` : "";
      const hrs = r.hours && r.hours.trim() !== "" ? ` - ${r.hours.trim()}` : "";
      return `${stamp}${r.task}${hrs}`.trim();
    });

    const tasksWithTimings = valid.map((r) => ({
      task: r.task.trim(),
      interval: r.interval?.trim() || "",
      timeTaken: r.hours?.trim() || "",
      isTopTask: !!r.isTopTask,
    }));

    const computedTopTasks = valid.filter((r) => r.isTopTask).map((r) => r.task.trim());

    submit.mutate({
      summary: "End of Day submission",
      completedItems,
      tasksWithTimings,
      top3Tasks: computedTopTasks,
      date,
    });
  };

  const generatePreview = () => {
    const validRows = rows.filter((r) => r.task.trim().length > 0);
    if (validRows.length === 0) return "";

    const topTasks = validRows.filter((r) => r.isTopTask);
    const completedTasks = validRows;

    let text = "";
    if (topTasks.length > 0) {
      text += "Top Tasks:\n";
      topTasks.forEach((t, i) => {
        text += `${i + 1}. ${t.task}\n`;
      });
      text += "\n";
    }

    text += "Completed Today (Chronological Work Timeline):\n";
    completedTasks.forEach((t) => {
      const stamp = t.interval && t.interval.trim() !== "" ? `[${t.interval.trim()}] ` : "";
      const hrs = t.hours && t.hours.trim() ? ` - ${t.hours.trim()}` : "";
      text += `- ${stamp}${t.task}${hrs}\n`;
    });

    return text.trim();
  };

  const previewText = generatePreview();

  const handleCopy = () => {
    if (!previewText) return;
    navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalMinutes = rows.reduce((acc, r) => acc + parseTimeToMinutes(r.hours), 0);
  const totalHoursFormatted = (() => {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  return (
    <Backdrop>
      <div
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="bg-white p-6 rounded-xl w-full max-w-5xl shadow-2xl max-h-[95vh] flex gap-8 animate-in zoom-in-95 duration-200 overflow-hidden"
      >
        {/* Left Column */}
        <div className="flex-[1.5] flex flex-col min-w-0">
          <h2 className="m-0 mb-2 text-lg font-bold text-slate-900 flex items-center gap-2">
            🌙 {title || "End of Day Submission"}
          </h2>
          <p className="m-0 mb-4 text-sm text-slate-500">
            {subtitle || (
              <>
                Log tasks throughout the day. It auto-saves.<br />
                <b>Paste / Drop a table</b> anywhere here. Press <b>Enter</b> to navigate.
              </>
            )}
          </p>

          {errorMsg && (
            <div className="bg-red-50 text-red-500 px-3 py-2 rounded-md mb-4 text-sm font-medium">
              {errorMsg}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-2 min-h-[300px]">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left font-semibold text-slate-400 text-xs py-2 w-10 border-b border-slate-200">Top</th>
                  <th className="text-left font-semibold text-slate-400 text-xs py-2 w-36 border-b border-slate-200">Time Stamp</th>
                  <th className="text-left font-semibold text-slate-400 text-xs py-2 border-b border-slate-200 pl-2">Task Description</th>
                  <th className="text-left font-semibold text-slate-400 text-xs py-2 w-28 border-b border-slate-200 pl-2">Time Logged</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="py-2 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={row.isTopTask || false}
                        onChange={(e) => handleUpdate(i, "isTopTask", e.target.checked)}
                        className="w-4 h-4 cursor-pointer accent-blue-500"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        ref={(el) => { intervalRefs.current[i] = el; }}
                        type="text"
                        value={row.interval || ""}
                        onChange={(e) => handleUpdate(i, "interval", e.target.value)}
                        placeholder="10:00 - 12:00"
                        className="w-full p-2 rounded-md border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-slate-800 bg-slate-50"
                      />
                    </td>
                    <td className="py-2 pl-2">
                      <input
                        ref={(el) => { taskRefs.current[i] = el; }}
                        type="text"
                        value={row.task}
                        onChange={(e) => handleUpdate(i, "task", e.target.value)}
                        onKeyDown={(e) => handleTaskKeyDown(e, i)}
                        placeholder="e.g. Built Analytics dashboard"
                        className="w-full p-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-slate-900"
                      />
                    </td>
                    <td className="py-2 pl-2">
                      <input
                        ref={(el) => { hoursRefs.current[i] = el; }}
                        type="text"
                        value={row.hours || ""}
                        onChange={(e) => handleUpdate(i, "hours", e.target.value)}
                        onBlur={() => handleUpdate(i, "hours", formatToHHMM(row.hours))}
                        onKeyDown={(e) => handleHoursKeyDown(e, i)}
                        placeholder="e.g. 2:00"
                        className="w-full p-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-slate-900"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="flex justify-between items-center mt-2">
              <button
                onClick={handleAddRow}
                className="text-blue-500 text-sm font-medium hover:text-blue-600 transition-colors"
              >
                + Add another row
              </button>
              <button
                onClick={handleReset}
                className={`text-sm transition-colors ${
                  resetConfirm ? "text-red-600 font-bold" : "text-red-500 font-medium hover:text-red-600"
                }`}
              >
                {resetConfirm ? "Click to confirm reset" : "Reset list"}
              </button>
            </div>
            
            <div className="mt-4 pt-4 border-t border-dashed border-slate-300 flex justify-end items-center gap-2.5">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-500" /> Total Tracked Time:
              </span>
              <span className="text-base text-blue-700 font-extrabold font-mono">
                {totalHoursFormatted}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-400">Draft auto-saved locally.</span>
            <div className="flex gap-2.5">
              {!forceSubmit && (
                <button
                  onClick={onClose}
                  disabled={submit.isPending}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold transition-colors disabled:opacity-50"
                >
                  Close
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={submit.isPending}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors text-white disabled:opacity-50 ${
                  submitConfirm ? "bg-emerald-500 hover:bg-emerald-600" : "bg-blue-500 hover:bg-blue-600"
                }`}
              >
                {submit.isPending ? "Submitting..." : submitConfirm ? "Click to Confirm" : "Submit Final EOD"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="w-[320px] shrink-0 bg-slate-50 p-5 rounded-lg border border-slate-200 flex flex-col min-h-0">
          {todoItems.length > 0 && (
            <div className="mb-5 bg-white p-4 rounded-lg border border-slate-300">
              <h3 className="m-0 mb-3 text-sm text-slate-700 font-bold flex items-center gap-1.5">
                📝 Select tasks from today&apos;s To-Do
              </h3>
              <div className="flex flex-col gap-2 overflow-y-auto max-h-[25vh]">
                {todoItems.map((todo, idx) => {
                  const isChecked = rows.some((r) => r.sourceTodoText === todo.text || r.task === todo.text);
                  return (
                    <label key={idx} className="flex items-start gap-2.5 text-sm text-slate-600 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setRows((prev) => {
                              if (prev.some((r) => r.sourceTodoText === todo.text || r.task === todo.text)) return prev;
                              const validRows = prev.filter((r) => r.task.trim() !== "");
                              return [...validRows, { id: crypto.randomUUID(), interval: "", task: todo.text, hours: "", isTopTask: false, sourceTodoText: todo.text }];
                            });
                          } else {
                            setRows((prev) => prev.filter((r) => !(r.sourceTodoText === todo.text || r.task === todo.text)));
                          }
                        }}
                        className="mt-0.5 cursor-pointer accent-blue-500"
                      />
                      <span>{todo.text}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <h3 className="m-0 text-sm text-slate-700 font-semibold">Live Preview</h3>
            <button
              onClick={handleCopy}
              disabled={!previewText}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                copied
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-white text-blue-500 border border-slate-300 hover:bg-slate-50"
              } ${!previewText ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy Report"}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-white p-3 rounded-md border border-slate-300 text-sm text-slate-600 whitespace-pre-wrap font-mono min-h-[150px]">
            {previewText || (
              <span className="text-slate-400 italic">No tasks entered yet...</span>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
