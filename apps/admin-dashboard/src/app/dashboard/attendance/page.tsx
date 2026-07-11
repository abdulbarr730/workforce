"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatMinutes, getStatusColor } from "@/lib/utils";
import { RefreshCw, Edit2, X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

interface AttendanceRecord {
  _id: string;
  employeeId: string;
  date: string;
  attendanceStatus: string;
  loginTime?: string;
  logoutTime?: string;
  productiveMinutes: number;
  breakMinutes: number;
  offlineMinutes?: number;
  lateMinutes: number;
  overtimeMinutes: number;
  sessions?: { loginAt: string; logoutAt: string | null; shiftId?: string }[];
  expectedLogoutTime?: string;
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [viewMode, setViewMode] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const d = new Date();
    const w = Math.ceil(
      ((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 +
        new Date(d.getFullYear(), 0, 1).getDay() +
        1) /
        7,
    );
    return `${d.getFullYear()}-W${w.toString().padStart(2, "0")}`;
  });
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editData, setEditData] = useState<
    Partial<AttendanceRecord> & { _id: string }
  >({ _id: "" });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: records, isLoading } = useQuery({
    queryKey: [
      "attendance-records",
      viewMode,
      selectedDate,
      selectedWeek,
      selectedMonth,
      selectedEmployee,
    ],
    queryFn: () => {
      let url = "/api/attendance/records?";
      if (selectedEmployee) url += `employeeId=${selectedEmployee}&`;

      if (viewMode === "daily") {
        url += `date=${selectedDate}`;
      } else if (viewMode === "weekly") {
        url += `week=${selectedWeek}`;
      } else {
        url += `month=${selectedMonth}`;
      }
      return api.get(url).then((r) => r.data.data);
    },
  });

  const generate = useMutation({
    mutationFn: (date: string) =>
      api.post("/api/attendance/generate", { date }),
  });

  const updateRecord = useMutation({
    mutationFn: (payload: any) =>
      api.put(`/api/attendance/records/${payload._id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-records"] });
      setEditModalOpen(false);
    },
  });

  const attendanceList: AttendanceRecord[] = records ?? [];

  // Monthly View Calculations (Exclude Sundays)
  const isSunday = (dateString: string) => new Date(dateString).getDay() === 0;

  const present = attendanceList.filter(
    (r) => r.attendanceStatus === "PRESENT",
  ).length;
  const late = attendanceList.filter(
    (r) => r.attendanceStatus === "LATE",
  ).length;
  const halfDay = attendanceList.filter(
    (r) => r.attendanceStatus === "HALF_DAY",
  ).length;
  const absent = attendanceList.filter(
    (r) => r.attendanceStatus === "ABSENT" && !isSunday(r.date),
  ).length;
  const totalPresent = present + halfDay + late;

  const displayedList = attendanceList.filter((r) => {
    if (!statusFilter) return true;
    if (statusFilter === "TOTAL_PRESENT") {
      return (
        r.attendanceStatus === "PRESENT" ||
        r.attendanceStatus === "HALF_DAY" ||
        r.attendanceStatus === "LATE"
      );
    }
    return r.attendanceStatus === statusFilter;
  });

  const handleEditClick = (record: AttendanceRecord) => {
    setEditData({
      _id: record._id,
      attendanceStatus: record.attendanceStatus,
      loginTime: record.loginTime,
      logoutTime: record.logoutTime,
      productiveMinutes: record.productiveMinutes,
      breakMinutes: record.breakMinutes,
      offlineMinutes: record.offlineMinutes || 0,
      lateMinutes: record.lateMinutes,
      overtimeMinutes: record.overtimeMinutes,
    });
    setEditModalOpen(true);
  };

  const submitEdit = () => {
    if (!editData._id) return;
    updateRecord.mutate(editData);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track and manage employee attendance records
          </p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode("daily")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === "daily" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            Daily View
          </button>
          <button
            onClick={() => setViewMode("weekly")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === "weekly" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            Weekly View
          </button>
          <button
            onClick={() => setViewMode("monthly")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === "monthly" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            Monthly View
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-xl border border-gray-200">
        <div className="flex items-center gap-4 w-full">
          {viewMode === "daily" ? (
            <>
              <div className="flex flex-col gap-1 w-full max-w-xs">
                <label className="text-xs font-medium text-gray-500">
                  Select Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="flex flex-col justify-end h-full pt-5">
                <button
                  onClick={() => generate.mutate(selectedDate)}
                  disabled={generate.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${generate.isPending ? "animate-spin" : ""}`}
                  />
                  {generate.isPending
                    ? "Processing..."
                    : "Generate Daily Report"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1 w-full max-w-xs">
                <label className="text-xs font-medium text-gray-500">
                  Select Employee (Optional)
                </label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">-- All Employees --</option>
                  {users
                    ?.filter(
                      (u: any) =>
                        u.role !== "SUPER_ADMIN" && u.role !== "ADMIN",
                    )
                    .map((u: any) => (
                      <option key={u.employeeId} value={u.employeeId}>
                        {u.name} ({u.employeeId})
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 w-full max-w-xs">
                <label className="text-xs font-medium text-gray-500">
                  Select {viewMode === "weekly" ? "Week" : "Month"}
                </label>
                {viewMode === "weekly" ? (
                  <input
                    type="week"
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                ) : (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {(viewMode === "daily" || selectedEmployee) && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            {
              label: "Total Present",
              value: totalPresent,
              color: "text-emerald-600",
              filter: "TOTAL_PRESENT",
            },
            {
              label: "Full Day Present",
              value: present,
              color: "text-green-600",
              filter: "PRESENT",
            },
            {
              label: "Late",
              value: late,
              color: "text-yellow-600",
              filter: "LATE",
            },
            {
              label: "Half Day",
              value: halfDay,
              color: "text-orange-600",
              filter: "HALF_DAY",
            },
            {
              label: "Absent (Excl. Sundays)",
              value: absent,
              color: "text-red-600",
              filter: "ABSENT",
            },
          ].map(({ label, value, color, filter }) => (
            <div
              key={label}
              onClick={() =>
                setStatusFilter(statusFilter === filter ? null : filter)
              }
              className={`bg-white rounded-xl border p-4 text-center cursor-pointer transition-all ${statusFilter === filter ? "ring-2 ring-gray-900 border-transparent shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}
            >
              <p className={`text-2xl font-semibold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>
      )}

      {generate.data && viewMode === "daily" && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Attendance generated successfully for {formatDate(selectedDate)}.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <p className="text-sm font-medium text-gray-900">
            {displayedList.length} records found{" "}
            {statusFilter && (
              <span className="text-gray-500 font-normal ml-2">
                (Filtered by {statusFilter.replace("_", " ")})
              </span>
            )}
          </p>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter(null)}
              className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
            >
              Clear filter
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Loading...
          </div>
        ) : displayedList.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No attendance records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {[
                    "Employee ID",
                    "Name",
                    "Date",
                    "Status",
                    "Sessions",
                    "Productive",
                    "Breaks",
                    "Offline",
                    "Late",
                    "OT",
                    ...(user?.role === "SUPER_ADMIN" ? ["Actions"] : []),
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
                {displayedList.map((record) => (
                  <tr
                    key={record._id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {record.employeeId}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {users?.find(
                        (u: any) => u.employeeId === record.employeeId,
                      )?.name || "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(record.date)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(record.attendanceStatus)}`}
                      >
                        {record.attendanceStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1 text-[11px] bg-slate-100 px-2 py-0.5 rounded w-fit">
                          {record.loginTime
                            ? new Date(record.loginTime).toLocaleTimeString(
                                "en-IN",
                                { hour: "2-digit", minute: "2-digit" },
                              )
                            : "—"}
                          {" - "}
                          {record.logoutTime ? (
                            record.expectedLogoutTime &&
                            new Date(record.logoutTime) >
                              new Date(record.expectedLogoutTime) ? (
                              <span title="Auto-capped to expected logout">
                                {new Date(
                                  record.expectedLogoutTime,
                                ).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            ) : (
                              new Date(record.logoutTime).toLocaleTimeString(
                                "en-IN",
                                { hour: "2-digit", minute: "2-digit" },
                              )
                            )
                          ) : record.expectedLogoutTime &&
                            new Date() > new Date(record.expectedLogoutTime) ? (
                            <span
                              className="text-slate-400 italic"
                              title="Expected"
                            >
                              {new Date(
                                record.expectedLogoutTime,
                              ).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : (
                            "..."
                          )}
                        </div>
                        {record.sessions && record.sessions.length > 0 && (
                          <span className="text-[10px] text-gray-400 font-medium pl-1">
                            ({record.sessions.length} session
                            {record.sessions.length === 1 ? "" : "s"})
                          </span>
                        )}
                      </div>
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
                    {user?.role === "SUPER_ADMIN" && (
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => handleEditClick(record)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Edit Attendance
              </h2>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={editData.attendanceStatus}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      attendanceStatus: e.target.value,
                    })
                  }
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="HALF_DAY">HALF_DAY</option>
                  <option value="LATE">LATE</option>
                  <option value="WEEKEND">WEEKEND</option>
                  <option value="HOLIDAY">HOLIDAY</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Login Time
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={
                      editData.loginTime
                        ? new Date(editData.loginTime)
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        loginTime: new Date(e.target.value).toISOString(),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Logout Time
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={
                      editData.logoutTime
                        ? new Date(editData.logoutTime)
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        logoutTime: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : undefined,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Productive (Mins)
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={editData.productiveMinutes}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        productiveMinutes: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Breaks (Mins)
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={editData.breakMinutes}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        breakMinutes: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Offline Work (Mins)
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={editData.offlineMinutes}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        offlineMinutes: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Late (Mins)
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={editData.lateMinutes}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        lateMinutes: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={updateRecord.isPending}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {updateRecord.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
