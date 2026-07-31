"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, init } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!isAuthenticated) {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("wf_token") : null;
      if (!token) router.replace("/login");
    }
  }, [isAuthenticated, router]);

  // Notifications SSE Connection
  const sseConnected = useRef(false);
  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (isAuthenticated && user && !sseConnected.current) {
      // Request permissions
      if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
      const token = localStorage.getItem("wf_token") || localStorage.getItem("token");

      const eventSource = new EventSource(`${API_URL}/notifications/stream?token=${token}`);
      sseConnected.current = true;

      eventSource.addEventListener("leave_processed", (e) => {
        try {
          const data = JSON.parse(e.data);
          if ("Notification" in window && Notification.permission === "granted") {
            const status = data.leave.status.toLowerCase();
            new Notification(`Leave ${status}`, { 
              body: `Your leave request has been ${status}.`
            });
          }
        } catch (err) {}
      });

      return () => {
        eventSource.close();
        sseConnected.current = false;
      };
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
