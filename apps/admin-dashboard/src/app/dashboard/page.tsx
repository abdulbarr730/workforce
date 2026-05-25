"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  Users, CalendarCheck, TrendingUp, Clock, Laptop, Activity, ArrowUpRight,
} from "lucide-react";

function HeroCard({ label, value, icon: Icon, sub, tone = "indigo" }: { label: string; value: string | number; icon: React.ElementType; sub?: string; tone?: "indigo" | "amber" | "green" | "rose" }) {
  const tones: Record<string, { grad: string; ring: string }> = {
    indigo: { grad: "linear-gradient(135deg,#4f46e5,#1e1b4b)", ring: "ring-indigo-100" },
    amber: { grad: "linear-gradient(135deg,#f59e0b,#b45309)", ring: "ring-amber-100" },
    green: { grad: "linear-gradient(135deg,#10b981,#047857)", ring: "ring-emerald-100" },
    rose: { grad: "linear-gradient(135deg,#f43f5e,#9f1239)", ring: "ring-rose-100" },
  };
  const t = tones[tone];
  return (
    <div className={`card p-5 ring-4 ${t.ring}`}>
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm"
          style={{ background: t.grad }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <ArrowUpRight className="w-4 h-4 text-gray-300" />
      </div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const today = new Date().toISOString().split("T")[0];

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.get("/api/devices").then((r) => r.data.data),
  });

  const { data: attendance, refetch: refetchAttendance, isFetching } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () =>
      api.post("/api/attendance/generate", { date: today }).then((r) => r.data.data),
    enabled: false,
  });

  const totalEmployees = Array.isArray(users) ? users.length : (users?.users?.length ?? 0);
  const presentToday = attendance?.filter((a: { success: boolean }) => a.success).length ?? 0;
  const totalDevices = Array.isArray(devices) ? devices.length : 0;
  const onlineDevices = Array.isArray(devices)
    ? devices.filter((d: any) => d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 5 * 60 * 1000).length
    : 0;

  return (
    <div className="space-y-8">
      {/* Hero banner */}
      <div
        className="relative overflow-hidden rounded-2xl p-8 text-white shadow-lg"
        style={{ background: "linear-gradient(120deg,#1e1b4b 0%,#4338ca 55%,#6366f1 100%)" }}
      >
        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full opacity-20" style={{ background: "radial-gradient(circle,#f59e0b 0%,transparent 70%)" }} />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.18em] text-indigo-200 mb-2">Welcome back</p>
          <h1 className="text-3xl font-bold mb-1">Workforce Command Center</h1>
          <p className="text-sm text-indigo-100">{formatDate(today)} · Prosync Infotech</p>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => refetchAttendance()}
              disabled={isFetching}
              className="btn-accent"
            >
              {isFetching ? "Generating…" : "Generate Today's Attendance"}
            </button>
            <a href="/dashboard/analytics" className="btn-ghost">View Analytics</a>
          </div>
        </div>
      </div>

      {/* Hero stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <HeroCard label="Total Employees" value={totalEmployees} icon={Users} tone="indigo" sub="Active workforce" />
        <HeroCard label="Present Today" value={presentToday} icon={CalendarCheck} tone="green" sub="Generated attendance" />
        <HeroCard label="Connected Devices" value={`${onlineDevices}/${totalDevices}`} icon={Laptop} tone="amber" sub="Online · Total" />
        <HeroCard
          label="Attendance Rate"
          value={totalEmployees ? `${Math.round((presentToday / totalEmployees) * 100)}%` : "—"}
          icon={TrendingUp}
          tone="rose"
          sub="vs. workforce size"
        />
      </div>

      {/* Today's attendance */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Today&apos;s Attendance</h2>
            <p className="text-xs text-gray-500 mt-0.5">Live results from the latest generation</p>
          </div>
          <span className="chip chip-indigo">
            <Activity className="w-3 h-3" /> {attendance?.length ?? 0} records
          </span>
        </div>
        {attendance && attendance.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((a: { employeeId: string; success: boolean; attendance?: { attendanceStatus: string }; reason?: string }) => (
                  <tr key={a.employeeId}>
                    <td className="font-medium">{a.employeeId}</td>
                    <td>
                      {a.success ? (
                        <span className="chip chip-green">{a.attendance?.attendanceStatus}</span>
                      ) : (
                        <span className="chip chip-red">Failed</span>
                      )}
                    </td>
                    <td className="text-gray-500">{a.success ? "—" : a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
            Click <span className="font-semibold text-gray-700">Generate Today&apos;s Attendance</span> above to process today&apos;s records
          </div>
        )}
      </div>
    </div>
  );
}
