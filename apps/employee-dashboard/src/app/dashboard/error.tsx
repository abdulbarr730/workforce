"use client";

import { useEffect } from "react";
import { RotateCw, AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    error?.name === "ChunkLoadError" ||
    /loading chunk/i.test(error?.message || "") ||
    /failed to fetch dynamically imported module/i.test(error?.message || "");

  useEffect(() => {
    if (isChunkError) {
      const lastReload = sessionStorage.getItem("chunk_reload_timestamp");
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10_000) {
        sessionStorage.setItem("chunk_reload_timestamp", now.toString());
        window.location.reload();
      }
    }
  }, [isChunkError]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="max-w-md w-full p-8 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">
          {isChunkError ? "Application Updated" : "Something went wrong"}
        </h2>
        <p className="text-xs text-slate-500">
          {isChunkError
            ? "A newer version of the dashboard was deployed. Please refresh to load the latest version."
            : "An unexpected error occurred while loading this dashboard view."}
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <button
            onClick={() => (isChunkError ? window.location.reload() : reset())}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-sm"
          >
            <RotateCw className="w-3.5 h-3.5" />
            {isChunkError ? "Reload Page" : "Try Again"}
          </button>
        </div>
      </div>
    </div>
  );
}
