"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatMinutes, getStatusColor } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

interface AttendanceRecord {
  _id: string;
  employeeId: string;
  date: string;
  attendanceStatus: string;
  loginTime?: string;
  logoutTime?: string;
  productiveMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
}

export default function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: records, isLoading } = useQuery({
    queryKey: ["attendance-records", selectedDate],
    queryFn: () => api.get(`/api/attendance/records?date=${selectedDate}`).then((r) => r.data.data),
  });

  const generate = useMutation({
    mutationFn: (date: string) => api.post("/api/attendance/generate", { date }),
  });

  const attendanceList: AttendanceRecord[] = records ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage daily attendance records</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            onClick={() => generate.mutate(selectedDate)}
            disabled={generate.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${generate.isPending ? "animate-spin" : ""}`} />
            {generate.isPending ? "Processing..." : "Generate"}
          </button>
        </div>
      </div>

      {generate.data && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Attendance generated successfully for {formatDate(selectedDate)}.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-900">
            {attendanceList.length} records for {formatDate(selectedDate)}
          </p>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : attendanceList.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No attendance records found. Click &quot;Generate&quot; to process attendance.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Employee ID", "Date", "Status", "Login", "Logout", "Productive", "Breaks", "Late", "OT"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendanceList.map((record) => (
                  <tr key={record._id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{record.employeeId}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(record.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(record.attendanceStatus)}`}>
                        {record.attendanceStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{record.loginTime ? new Date(record.loginTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{record.logoutTime ? new Date(record.logoutTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatMinutes(record.productiveMinutes)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatMinutes(record.breakMinutes)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{record.lateMinutes ? `${record.lateMinutes}m` : "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{record.overtimeMinutes ? `${record.overtimeMinutes}m` : "—"}</td>
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
