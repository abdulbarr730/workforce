"use client";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { FileText, X, CheckCircle2 } from "lucide-react";

type Props = {
  forceSubmit?: boolean; // when true (time-up flow), no cancel button
  date?: string; // optional backfill date (YYYY-MM-DD), defaults to today
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSubmitted: () => void;
};

type TodoDoc = { items: { text: string; done: boolean }[] } | null;

export function EodModal({
  forceSubmit,
  date,
  title,
  subtitle,
  onClose,
  onSubmitted,
}: Props) {
  const qc = useQueryClient();
  const { data: todo } = useQuery<TodoDoc>({
    queryKey: ["my-todo-today"],
    queryFn: () => api.get("/api/me/todos/today").then((r) => r.data.data),
  });

  const [summary, setSummary] = useState("");
  const [blockers, setBlockers] = useState("");
  const [hoursWorked, setHoursWorked] = useState("");
  const [completed, setCompleted] = useState<Record<number, boolean>>({});
  const [error, setError] = useState("");

  // Pre-select any items already marked done in the todo
  useEffect(() => {
    if (!todo?.items) return;
    const next: Record<number, boolean> = {};
    todo.items.forEach((it: { text: string; done: boolean }, i: number) => {
      if (it.done) next[i] = true;
    });
    setCompleted(next);
  }, [todo]);

  const submit = useMutation({
    mutationFn: () =>
      api.post("/api/me/eod", {
        summary: summary.trim(),
        completedItems: (todo?.items ?? [])
          .map((it, i) => (completed[i] ? it.text : null))
          .filter(Boolean),
        blockers: blockers.trim(),
        hoursWorked: hoursWorked ? Number(hoursWorked) : undefined,
        ...(date ? { date } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-eod-today"] });
      qc.invalidateQueries({ queryKey: ["my-eod-pending"] });
      onSubmitted();
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || "Failed to submit"),
  });

  return (
    <Backdrop>
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">
        <div
          className="p-6 rounded-t-2xl text-white relative"
          style={{ background: "linear-gradient(120deg,#7c2d12,#d97706)" }}
        >
          {!forceSubmit && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/80 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">
                {title ?? "End-of-Day Report"}
              </h2>
              <p className="text-xs text-amber-100 mt-0.5">
                {subtitle ??
                  (forceSubmit
                    ? "Submit your EOD to log out."
                    : "Wrap up your day before signing out.")}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {todo?.items && todo.items.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                What did you complete today?
              </label>
              <div className="space-y-1.5">
                {todo.items.map((it, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!!completed[i]}
                      onChange={(e) =>
                        setCompleted({ ...completed, [i]: e.target.checked })
                      }
                      className="mt-0.5"
                    />
                    <span
                      className={
                        completed[i]
                          ? "text-sm text-gray-900 line-through"
                          : "text-sm text-gray-700"
                      }
                    >
                      {it.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Summary <span className="text-red-500">*</span>
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="Briefly describe what you accomplished today…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                Blockers / notes
              </label>
              <textarea
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                rows={2}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                Hours worked
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
                placeholder="8"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50 rounded-b-2xl">
          {!forceSubmit && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              setError("");
              if (!summary.trim()) {
                setError("Summary is required");
                return;
              }
              submit.mutate();
            }}
            disabled={submit.isPending}
            className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
            style={{ background: "linear-gradient(180deg,#f59e0b,#b45309)" }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {submit.isPending ? "Submitting…" : "Submit EOD & sign out"}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      {children}
    </div>
  );
}
