"use client";
import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, CheckCircle, Copy } from "lucide-react";

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      {children}
    </div>
  );
}

export function TodoModal({ onSaved, date, customSubmitFn }: { onSaved: () => void; date?: string; customSubmitFn?: (data: any) => Promise<any> }) {
  const qc = useQueryClient();
  const [tasks, setTasks] = useState<{ id: string; text: string; done: boolean }[]>([
    { id: crypto.randomUUID(), text: "", done: false },
  ]);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
  };

  useEffect(() => {
    if (!date) {
      api.get("/api/me/todos/today")
        .then((r) => {
          const existing = r.data?.data?.items;
          if (Array.isArray(existing) && existing.length > 0) {
            setTasks(
              existing.map((t: any) => ({
                ...t,
                id: t.id || crypto.randomUUID(),
              }))
            );
          }
        })
        .catch(() => {});
    }
  }, [date]);

  const handleAddRow = () => {
    setTasks((prev) => {
      const next = [...prev, { id: crypto.randomUUID(), text: "", done: false }];
      setTimeout(() => {
        if (inputRefs.current[next.length - 1]) {
          inputRefs.current[next.length - 1]?.focus();
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
    setTasks([{ id: crypto.randomUUID(), text: "", done: false }]);
    setResetConfirm(false);
  };

  const processTableData = (text: string) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 1) return;

    const parsedRows = lines
      .map((line) => {
        const cols = line.split(/\t|,/);
        return { id: crypto.randomUUID(), text: cols[0].trim(), done: false };
      })
      .filter((r) => r.text);

    if (parsedRows.length > 0) {
      if (
        parsedRows[0].text.toLowerCase() === "task" ||
        parsedRows[0].text.toLowerCase() === "description"
      ) {
        parsedRows.shift();
      }
      setTasks((prev) => {
        const keep = prev.filter((p) => p.text.trim() !== "");
        return [...keep, ...parsedRows];
      });
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

  const handleUpdate = (index: number, text: string) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], text };
    setTasks(newTasks);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index === tasks.length - 1) {
        handleAddRow();
      } else {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const submit = useMutation({
    mutationFn: customSubmitFn || ((validTasks: any[]) =>
      api.post("/api/me/todos", {
        items: validTasks.map((t) => ({ text: t.text, done: t.done })),
        date,
      })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-todo-today"] });
      qc.invalidateQueries({ queryKey: ["missed-tasks"] });
      qc.invalidateQueries({ queryKey: ["team-missed-tasks"] });
      onSaved();
    },
    onError: (e: any) => showError(e?.response?.data?.message || "Failed to save"),
  });

  const handleSubmit = () => {
    const valid = tasks.filter((t) => t.text.trim().length > 0);
    if (valid.length === 0) return showError("Please enter at least one task");
    submit.mutate(valid);
  };

  const previewText = tasks
    .filter((t) => t.text.trim().length > 0)
    .map((t) => `[ ] ${t.text.trim()}`)
    .join("\n");

  const handleCopy = () => {
    if (!previewText) return;
    navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Backdrop>
      <div
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="bg-white p-6 rounded-xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex gap-8 animate-in zoom-in-95 duration-200"
      >
        {/* Left Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <h2 className="m-0 mb-4 text-lg font-bold text-slate-900 flex items-center gap-2">
            📝 Start of Day: To-Do List {date ? `(${date})` : ""}
          </h2>
          <p className="m-0 mb-4 text-sm text-slate-500">
            Please list your tasks. You can <b>Paste</b> or <b>Drop</b> a list here. Press <b>Enter</b> to add a new task.
          </p>

          {errorMsg && (
            <div className="bg-red-50 text-red-500 px-3 py-2 rounded-md mb-4 text-sm font-medium">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-2.5 mb-4 max-h-[50vh] overflow-y-auto pr-2">
            {tasks.map((task, i) => (
              <input
                key={task.id}
                ref={(el) => { inputRefs.current[i] = el; }}
                value={task.text}
                onChange={(e) => handleUpdate(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                placeholder={`Task ${i + 1}`}
                className="w-full p-2.5 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-slate-900"
              />
            ))}
            <div className="flex justify-between items-center mt-2">
              <button
                onClick={handleAddRow}
                className="text-blue-500 text-sm font-medium hover:text-blue-600 transition-colors"
              >
                + Add another task
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
          </div>

          <div className="mt-auto pt-4 space-y-2">
            <button
              onClick={handleSubmit}
              disabled={submit.isPending}
              className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors disabled:opacity-50"
            >
              {submit.isPending ? "Saving..." : "Save To-Do List"}
            </button>
            <button
              onClick={onSaved}
              className="w-full py-2.5 rounded-lg bg-transparent text-slate-500 hover:bg-slate-50 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Right Column (Live Preview) */}
        <div className="w-[300px] shrink-0 bg-slate-50 p-5 rounded-lg border border-slate-200 flex flex-col">
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
              {copied ? "Copied" : "Copy List"}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-white p-3 rounded-md border border-slate-300 text-sm text-slate-600 whitespace-pre-wrap font-mono">
            {previewText || (
              <span className="text-slate-400 italic">No tasks entered yet...</span>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
