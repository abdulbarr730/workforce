"use client";
import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { useQueryClient } from "@tanstack/react-query";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, init } = useAuthStore();
  const router = useRouter();
  const rawPathname = usePathname();
  const pathname = rawPathname || "";
  const sseConnected = useRef(false);
  const queryClient = useQueryClient();

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
  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (
      isAuthenticated &&
      user &&
      ["ADMIN", "SUPER_ADMIN", "HR"].includes(user.role) &&
      !sseConnected.current
    ) {
      // Request permissions
      if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
      }

      const configuredApiUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const API_URL = configuredApiUrl.endsWith("/api")
        ? configuredApiUrl
        : `${configuredApiUrl}/api`;
      const token =
        localStorage.getItem("wf_token") || localStorage.getItem("token");

      // Unfortunately standard EventSource doesn't support Authorization headers easily,
      // but in many implementations, auth token is sent via query param if needed.
      // Wait, we can pass it as a query parameter or use a polyfill, but since it's a dashboard,
      // we'll pass token as query parameter so backend authenticate middleware can extract it.
      const eventSource = new EventSource(
        `${API_URL}/notifications/stream?token=${token}`,
      );
      sseConnected.current = true;

      eventSource.addEventListener("auth_event", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification(data.title, { body: data.message });
          }
        } catch (err) {}
      });

      eventSource.addEventListener("daily_flow_event", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification(data.title, { body: data.message });
          }
        } catch (err) {}
      });

      eventSource.addEventListener("leave_requested", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("Leave Requested", {
              body: `A new leave request has been submitted.`,
            });
          }
        } catch (err) {}
      });

      eventSource.addEventListener("admin_notification", (e) => {
        try {
          const data = JSON.parse(e.data);
          const notification = data.notification;
          const separator = notification.deepLink?.includes("?") ? "&" : "?";
          const deepLink = `${notification.deepLink || "/dashboard"}${separator}notification=${notification._id}`;

          queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
          window.dispatchEvent(
            new CustomEvent("admin-notification", { detail: notification }),
          );

          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            const desktopNotification = new Notification(notification.title, {
              body: notification.message,
              tag: notification._id,
            });
            desktopNotification.onclick = () => {
              window.focus();
              router.push(deepLink);
              desktopNotification.close();
            };
          }
        } catch (err) {}
      });

      return () => {
        eventSource.close();
        sseConnected.current = false;
      };
    }
  }, [isAuthenticated, queryClient, router]);

  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (user?.role === "ADMIN") {
      const adminAllowedRoutes = [
        "/dashboard",
        "/dashboard/employees",
        "/dashboard/devices",
        "/dashboard/attendance",
        "/dashboard/leaves",
        "/dashboard/shifts",
        "/dashboard/departments",
        "/dashboard/analytics",
        "/dashboard/daily-reports",
        "/dashboard/reports",
        "/dashboard/welcome-calls",
        "/dashboard/screenshots",
        "/dashboard/productivity-rules",
        "/dashboard/rules",
        "/dashboard/sync-errors",
        "/dashboard/grievances",
      ];

      const isAllowed = adminAllowedRoutes.some((route) => {
        if (route === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(route);
      });

      if (!isAllowed) {
        router.replace("/dashboard");
      }
    }
  }, [pathname, router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
