"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ListChecks, Plus, X, GripVertical } from "lucide-react";

export function TodoModal({ onSaved }: { onSaved: () => void }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<string[]>([""]);
  const [error, setError] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api.post("/api/me/todos", {
        items: items
          .filter((t) => t.trim())
          .map((text) => ({ text, done: false })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-todo-today"] });
      onSaved();
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || "Failed to save"),
  });

  const filled = items.filter((t) => t.trim()).length;

  return (
    <Backdrop>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div
          className="p-6 rounded-t-2xl text-white"
          style={{ background: "linear-gradient(120deg,#1e1b4b,#4338ca)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <ListChecks className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Plan your day</h2>
              <p className="text-xs text-indigo-200 mt-0.5">
                Add the tasks you intend to work on today.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto">
          {items.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
              <input
                value={val}
                placeholder={`Task ${i + 1}`}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = e.target.value;
                  setItems(next);
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {items.length > 1 && (
                <button
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setItems([...items, ""])}
            className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:text-indigo-600 hover:border-indigo-300 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Add task
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="p-6 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-2xl">
          <span className="text-xs text-gray-500">
            {filled} task{filled === 1 ? "" : "s"} ready
          </span>
          <button
            onClick={() => submit.mutate()}
            disabled={filled === 0 || submit.isPending}
            className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
            style={{ background: "linear-gradient(180deg,#4f46e5,#4338ca)" }}
          >
            {submit.isPending ? "Saving…" : "Start my day"}
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
