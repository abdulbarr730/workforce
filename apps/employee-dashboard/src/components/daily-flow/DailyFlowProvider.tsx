"use client";
import { useAuthStore } from "@/store/auth.store";

export function DailyFlowProvider({ children }: { children: React.ReactNode }) {
  // Popups are now handled by the desktop agent, so this provider just wraps children
  return <>{children}</>;
}
