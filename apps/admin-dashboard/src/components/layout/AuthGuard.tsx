"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, init } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

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

  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (user?.role === "ADMIN") {
      const adminAllowedRoutes = [
        "/dashboard",
        "/dashboard/employees",
        "/dashboard/devices",
        "/dashboard/attendance",
        "/dashboard/shifts",
        "/dashboard/departments",
        "/dashboard/analytics",
        "/dashboard/daily-reports",
        "/dashboard/reports",
        "/dashboard/screenshots",
        "/dashboard/productivity-rules",
        "/dashboard/rules",
        "/dashboard/sync-errors",
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
