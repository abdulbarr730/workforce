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
    enabled: true,
    refetchInterval: 30_000,
  });

  const employeeList = Array.isArray(users) ? users.filter((u: any) => u.role === "EMPLOYEE") : (users?.users?.filter((u: any) => u.role === "EMPLOYEE") ?? []);
  const totalEmployees = employeeList.length;
  const presentToday = attendance?.filter((a: { success: boolean; attendance?: any }) => a.success && a.attendance?.attendanceStatus !== 'ABSENT').length ?? 0;
  const totalDevices = Array.isArray(devices) ? devices.length : 0;
  const onlineDevices = Array.isArray(devices)
    ? devices.filter((d: any) => d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 5 * 60 * 1000).length
    : 0;

  const getUserName = (id: string) => {
    const allUsers = Array.isArray(users) ? users : (users?.users ?? []);
    const user = allUsers.find((u: any) => u.employeeId === id);
    return user ? user.name : id;
  };

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
            <a href="/dashboard/analytics" className="btn-accent">View Detailed Analytics</a>
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
            <h2 className="text-base font-semibold text-gray-900">Today's Live Attendance</h2>
            <p className="text-xs text-gray-500 mt-0.5">Real-time status of all employees</p>
          </div>
          <span className="chip chip-indigo">
            <Activity className="w-3 h-3" /> {attendance?.length ?? 0} records
          </span>
        </div>
        {attendance ? (
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Shift</th>
                  <th>Login Time</th>
                  <th>Expected Logout</th>
                  <th>Actual Logout</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((a: { employeeId: string; success: boolean; attendance?: any; reason?: string }) => {
                  const isAbsent = a.attendance?.attendanceStatus === 'ABSENT';
                  return (
                  <tr key={a.employeeId}>
                    <td className="font-medium">
                      <a href={`/dashboard/analytics?employeeId=${a.employeeId}`} className="text-indigo-600 hover:text-indigo-800 hover:underline transition-colors">
                        {getUserName(a.employeeId)}
                      </a>
                    </td>
                    <td>
                      {a.success ? (
                        <span className={`chip ${isAbsent ? 'chip-red' : a.attendance?.attendanceStatus === 'HALF_DAY' ? 'chip-amber' : 'chip-green'}`}>
                          {a.attendance?.attendanceStatus === 'HALF_DAY' ? 'Half Day' : a.attendance?.attendanceStatus || 'PRESENT'}
                        </span>
                      ) : (
                        <span className="chip chip-red">Failed</span>
                      )}
                    </td>
                    <td className="text-gray-600 text-sm">
                      {isAbsent ? "—" : (a.success && a.attendance?.shiftAssigned ? a.attendance.shiftAssigned : "—")}
                    </td>
                    <td className="text-gray-600 text-sm">
                      {isAbsent ? "—" : (a.success && a.attendance?.loginTime ? new Date(a.attendance.loginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—")}
                    </td>
                    <td className="text-gray-600 text-sm">
                      {isAbsent ? "—" : (a.success && a.attendance?.expectedLogoutTime ? (
                        <span>
                          {new Date(a.attendance.expectedLogoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : "—")}
                    </td>
                    <td className="text-gray-600 text-sm">
                      {isAbsent ? "—" : (a.success && a.attendance?.logoutTime ? new Date(a.attendance.logoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (a.success && a.attendance?.loginTime ? <span className="text-emerald-600 font-medium text-xs">Ongoing</span> : "—"))}
                    </td>
                  </tr>
                )})}
                {attendance.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-sm text-gray-400">No attendance data found for today</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex justify-center items-center py-10">
            <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
}
