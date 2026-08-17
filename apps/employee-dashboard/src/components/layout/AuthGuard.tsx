"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized, init } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) {
      init();
    }
  }, [init, isInitialized]);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isInitialized, isAuthenticated, router]);

  // Notifications SSE Connection
  const sseConnected = useRef(false);
  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (isAuthenticated && user && !sseConnected.current) {
      // Request permissions
      if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
      const token =
        localStorage.getItem("wf_token") || localStorage.getItem("token");

      const eventSource = new EventSource(
        `${API_URL}/notifications/stream?token=${token}`,
      );
      sseConnected.current = true;

      eventSource.addEventListener("leave_processed", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            const status = data.leave.status.toLowerCase();
            new Notification(`Leave ${status}`, {
              body: `Your leave request has been ${status}.`,
            });
          }
        } catch (err) {}
      });

      eventSource.addEventListener("welcome_call_sheet_missing", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification(data.title || "Welcome-call sheet row missing", {
              body: data.message,
            });
          }
        } catch (err) {}
      });

      eventSource.addEventListener("holiday_updated", (e) => {
        try {
          const data = JSON.parse(e.data);
          const holiday = data.holiday;
          if (
            "Notification" in window &&
            Notification.permission === "granted" &&
            holiday?.name
          ) {
            new Notification("Holiday calendar updated", {
              body: `${holiday.name} · ${holiday.date}`,
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

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
