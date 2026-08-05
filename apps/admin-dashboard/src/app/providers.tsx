"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      }),
  );

  useEffect(() => {
    // Auto-reload on chunk load error after a new deployment
    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const error = "reason" in event ? event.reason : event.error;
      const message = error?.message || (typeof error === "string" ? error : "");
      const isChunkError =
        error?.name === "ChunkLoadError" ||
        /loading chunk/i.test(message) ||
        /failed to fetch dynamically imported module/i.test(message);

      if (isChunkError) {
        const lastReload = sessionStorage.getItem("chunk_reload_timestamp");
        const now = Date.now();
        // Prevent rapid reload loop (allow 1 reload per 10 seconds)
        if (!lastReload || now - parseInt(lastReload, 10) > 10_000) {
          sessionStorage.setItem("chunk_reload_timestamp", now.toString());
          window.location.reload();
        }
      }
    };

    window.addEventListener("error", handleChunkError);
    window.addEventListener("unhandledrejection", handleChunkError);
    return () => {
      window.removeEventListener("error", handleChunkError);
      window.removeEventListener("unhandledrejection", handleChunkError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

