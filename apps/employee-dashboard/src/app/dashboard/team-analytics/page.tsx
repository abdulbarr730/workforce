"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { TeamOverview } from "./TeamOverview";
import { AlertCircle } from "lucide-react";

export default function TeamAnalyticsPage() {
  const { user } = useAuthStore();
  const [dateInput, setDateInput] = useState(
    new Date().toISOString().split("T")[0]
  );

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  if (user?.role !== "MANAGER") {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-gray-500 mt-2">
          Only managers can view team analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Team Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            Monitor your department's productivity
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <TeamOverview
        dateInput={dateInput}
        users={users}
        onSelectEmployee={() => {}}
      />
    </div>
  );
}
