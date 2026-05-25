import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function getStatusColor(status: string) {
  const map: Record<string, string> = {
    PRESENT: "text-green-600 bg-green-50",
    LATE: "text-yellow-600 bg-yellow-50",
    HALF_DAY: "text-orange-600 bg-orange-50",
    ABSENT: "text-red-600 bg-red-50",
    HOLIDAY: "text-blue-600 bg-blue-50",
    WEEKEND: "text-gray-500 bg-gray-50",
    LEAVE: "text-purple-600 bg-purple-50",
    ON_BREAK: "text-cyan-600 bg-cyan-50",
    AWAY_WORKING: "text-teal-600 bg-teal-50",
  };
  return map[status] ?? "text-gray-600 bg-gray-50";
}
