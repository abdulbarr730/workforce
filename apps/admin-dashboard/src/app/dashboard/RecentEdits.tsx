"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Edit2, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";

export function RecentEdits({ limit }: { limit?: number } = {}) {
  const router = useRouter();
  const { data: recentEdits, isLoading } = useQuery({
    queryKey: ["recent-edits"],
    queryFn: () =>
      api.get("/api/daily-flow/recent-edits").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm animate-pulse h-64">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!recentEdits || recentEdits.length === 0) {
    return null;
  }

  const visibleEdits = limit ? recentEdits.slice(0, limit) : recentEdits;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
          <Edit2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Recent Edits
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Employees who have recently modified their EODs or Todos.
          </p>
        </div>
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {visibleEdits.map((edit: any) => (
          <button
            key={edit.id}
            onClick={() => router.push(edit.deepLink)}
            className="w-full bg-gray-50 p-4 rounded-xl border border-gray-100 text-left hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 text-sm">
                  {edit.employeeName}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    edit.type === "TODO"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {edit.type}
                </span>
              </div>
              <span className="text-xs font-medium text-gray-400">
                {new Date(edit.editedAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="bg-white p-3 rounded-lg border border-gray-100 mt-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" /> Reason for Edit
              </p>
              <p className="text-sm text-gray-800 leading-relaxed font-medium">
                "{edit.reason}"
              </p>
            </div>
            {edit.diff &&
              (edit.diff.added?.length > 0 ||
                edit.diff.removed?.length > 0) && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <p className="rounded-lg bg-red-50 p-2 text-red-700">
                    <strong>Removed:</strong>{" "}
                    {edit.diff.removed?.join(", ") || "None"}
                  </p>
                  <p className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                    <strong>Added:</strong>{" "}
                    {edit.diff.added?.join(", ") || "None"}
                  </p>
                </div>
              )}
          </button>
        ))}
      </div>
    </div>
  );
}
