"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatDate, formatMinutes, getStatusColor } from "@/lib/utils";

interface AttendanceRecord {
  _id: string;
  date: string;
  attendanceStatus: string;
  loginTime?: string;
  logoutTime?: string;
  productiveMinutes: number;
  breakMinutes: number;
  offlineMinutes?: number;
  lateMinutes: number;
  overtimeMinutes: number;
}

export default function MyAttendancePage() {
  const { user } = useAuthStore();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const { data: records, isLoading } = useQuery({
    queryKey: ["my-attendance", user?.employeeId, month],
    queryFn: () =>
      api
        .get(
          `/api/attendance/records?employeeId=${user?.employeeId}&month=${month}`,
        )
        .then((r) => r.data.data),
    enabled: !!user?.employeeId,
  });

  const list: AttendanceRecord[] = records ?? [];

  const isSunday = (dateString: string) => new Date(dateString).getDay() === 0;

  const present = list.filter((r) => r.attendanceStatus === "PRESENT").length;
  const late = list.filter((r) => r.attendanceStatus === "LATE").length;
  const absent = list.filter(
    (r) => r.attendanceStatus === "ABSENT" && !isSunday(r.date),
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your personal attendance records
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Present", value: present, color: "text-green-600" },
          { label: "Late", value: late, color: "text-yellow-600" },
          {
            label: "Absent (Excl. Sundays)",
            value: absent,
            color: "text-red-600",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-gray-200 p-4 text-center"
          >
            <p className={`text-2xl font-semibold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Loading...
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No records for this month
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {[
                    "Date",
                    "Status",
                    "Login",
                    "Logout",
                    "Productive",
                    "Breaks",
                    "Offline",
                    "Late",
                    "OT",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((record) => (
                  <tr
                    key={record._id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {formatDate(record.date)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(record.attendanceStatus)}`}
                      >
                        {record.attendanceStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {record.loginTime
                        ? new Date(record.loginTime).toLocaleTimeString(
                            "en-IN",
                            { hour: "2-digit", minute: "2-digit" },
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {record.logoutTime
                        ? new Date(record.logoutTime).toLocaleTimeString(
                            "en-IN",
                            { hour: "2-digit", minute: "2-digit" },
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatMinutes(record.productiveMinutes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatMinutes(record.breakMinutes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatMinutes(record.offlineMinutes || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {record.lateMinutes ? `${record.lateMinutes}m` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {record.overtimeMinutes
                        ? `${record.overtimeMinutes}m`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
