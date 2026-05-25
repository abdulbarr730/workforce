"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Users, CalendarCheck, TrendingUp, Clock } from "lucide-react";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const today = new Date().toISOString().split("T")[0];

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: attendance, refetch: refetchAttendance, isFetching } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () =>
      api.post("/api/attendance/generate", { date: today }).then((r) => r.data.data),
    enabled: false,
  });

  const totalEmployees = users?.users?.length ?? 0;
  const presentToday = attendance?.filter((a: { success: boolean }) => a.success).length ?? 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{formatDate(today)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Employees" value={totalEmployees} icon={Users} color="bg-blue-50 text-blue-600" />
        <StatCard label="Present Today" value={presentToday} icon={CalendarCheck} color="bg-green-50 text-green-600" />
        <StatCard label="On Leave" value="—" icon={Clock} color="bg-yellow-50 text-yellow-600" />
        <StatCard label="Attendance Rate" value={totalEmployees ? `${Math.round((presentToday / totalEmployees) * 100)}%` : "—"} icon={TrendingUp} color="bg-purple-50 text-purple-600" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Today&apos;s Attendance</h2>
          <button
            onClick={() => refetchAttendance()}
            disabled={isFetching}
            className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {isFetching ? "Generating..." : "Generate Attendance"}
          </button>
        </div>
        {attendance ? (
          <div className="space-y-2">
            {attendance.map((a: { employeeId: string; success: boolean; attendance?: { attendanceStatus: string }; reason?: string }) => (
              <div key={a.employeeId} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-700">{a.employeeId}</span>
                {a.success ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                    {a.attendance?.attendanceStatus}
                  </span>
                ) : (
                  <span className="text-xs text-red-500">{a.reason}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">Click &quot;Generate Attendance&quot; to process today&apos;s records</p>
        )}
      </div>
    </div>
  );
}
