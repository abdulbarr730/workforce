"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatMinutes, getStatusColor } from "@/lib/utils";
import { RefreshCw, Edit2, X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeCalendarView } from "./EmployeeCalendarView";
import { MonthlyShortfallPanel } from "./MonthlyShortfallPanel";

interface AttendanceRecord {
  _id: string;
  employeeId: string;
  date: string;
  attendanceStatus: string;
  loginTime?: string;
  logoutTime?: string;
  productiveMinutes: number;
  requiredWorkMinutes?: number;
  breakMinutes: number;
  idleMinutes: number;
  awayWorkingMinutes?: number;
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
    Partial<AttendanceRecord> & { _id: string; correctionReason?: string }
  >({ _id: "", correctionReason: "" });
  const canEditAttendance = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.get("/api/devices").then((r) => r.data.data),
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
    refetchInterval:
      viewMode === "daily" &&
      selectedDate === new Date().toLocaleDateString("en-CA")
        ? 15_000
        : false,
  });

  const { data: leaves } = useQuery({
    queryKey: ["all-leaves"],
    queryFn: () => api.get("/api/attendance/time-off/leaves").then((r) => r.data.data),
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
      alert("Attendance record updated successfully!");
    },
    onError: (err: any) => {
      console.error("Error updating record:", err);
      alert(`Error saving: ${err?.response?.data?.message || err.message}`);
    }
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

  const loggedInEmployeeIds = Array.isArray(devices)
    ? [...new Set(devices
        .filter(
          (d: any) =>
            d.lastSeenAt &&
            Date.now() - new Date(d.lastSeenAt).getTime() < 5 * 60 * 1000,
        )
        .map((d: any) => d.employeeId))]
    : [];
  const loggedInCount = attendanceList.filter(r => loggedInEmployeeIds.includes(r.employeeId)).length;
  const activeEmployeeIds = new Set<string>(
    (users || [])
      .filter((u: any) => u.role !== "SUPER_ADMIN" && u.role !== "ADMIN" && u.isActive !== false)
      .map((u: any) => u.employeeId),
  );
  const recordedTodayEmployeeIds = new Set(
    attendanceList
      .filter((record) => record.attendanceStatus !== "WEEKEND" && record.attendanceStatus !== "HOLIDAY" && record.attendanceStatus !== "LEAVE")
      .map((record) => record.employeeId),
  );
  const mayBecomeAbsentCount =
    viewMode === "daily" && isToday(selectedDate)
      ? Array.from(activeEmployeeIds).filter(
          (employeeId) => !recordedTodayEmployeeIds.has(employeeId),
        ).length
      : 0;
  const notFullDayYetCount =
    viewMode === "daily" && isToday(selectedDate)
      ? attendanceList.filter(
          (record) =>
            ["PRESENT", "LATE", "HALF_DAY"].includes(record.attendanceStatus) &&
            loggedInEmployeeIds.includes(record.employeeId) &&
            (record.productiveMinutes || 0) <
              ((record as any).requiredWorkMinutes || 120),
        ).length
      : 0;
  const crossedHalfDayMarkCount =
    viewMode === "daily" && isToday(selectedDate)
      ? attendanceList.filter(
          (record) =>
            ["PRESENT", "LATE", "HALF_DAY"].includes(record.attendanceStatus) &&
            (record.productiveMinutes || 0) >= 120,
        ).length
      : 0;

  const displayedList = attendanceList.filter((r) => {
    if (!statusFilter) return true;
    if (statusFilter === "TOTAL_PRESENT") {
      return (
        r.attendanceStatus === "PRESENT" ||
        r.attendanceStatus === "HALF_DAY" ||
        r.attendanceStatus === "LATE"
      );
    }
    if (statusFilter === "LOGGED_IN") {
      return loggedInEmployeeIds.includes(r.employeeId);
    }
    return r.attendanceStatus === statusFilter;
  });
  function isPast(dateStr: string) {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  }

  function isToday(dateStr: string) {
    const d = new Date(dateStr);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  }


  const getDatesForWeek = (weekStr: string) => {
    if (!weekStr) return [];
    const year = parseInt(weekStr.substring(0, 4), 10);
    const week = parseInt(weekStr.substring(6, 8), 10);
    
    const d = new Date(year, 0, 1);
    d.setDate(d.getDate() + (4 - (d.getDay() || 7)));
    d.setHours(d.getHours() + (week - 1) * 168);
    d.setDate(d.getDate() - (d.getDay() || 7) + 1);

    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(d);
      day.setDate(day.getDate() + i);
      const yyyy = day.getFullYear();
      const mm = String(day.getMonth() + 1).padStart(2, "0");
      const dd = String(day.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    });
  };

  const getDatesForMonth = (monthStr: string) => {
    if (!monthStr) return [];
    const [year, month] = monthStr.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return Array.from({ length: lastDay }, (_, i) => {
      const yyyy = year;
      const mm = String(month).padStart(2, "0");
      const dd = String(i + 1).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    });
  };

  const calendarDates =
    viewMode === "weekly"
      ? getDatesForWeek(selectedWeek)
      : viewMode === "monthly"
        ? getDatesForMonth(selectedMonth)
        : [];

  const employeeMap = new Map<string, any>();
  if (viewMode !== "daily") {
    users
      ?.filter((u: any) => u.role !== "SUPER_ADMIN" && u.role !== "ADMIN")
      .forEach((u: any) => {
        employeeMap.set(u.employeeId, {
          employeeId: u.employeeId,
          name: u.name,
          createdAt: u.createdAt,
          records: {},
        });
      });

    displayedList.forEach((record) => {
      if (employeeMap.has(record.employeeId)) {
        employeeMap.get(record.employeeId).records[record.date] = record;
      } else {
        employeeMap.set(record.employeeId, {
          employeeId: record.employeeId,
          name: record.employeeId,
          createdAt: null,
          records: { [record.date]: record },
        });
      }
    });
  }

  const calendarEmployees = Array.from(employeeMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const handleEditClick = (record: AttendanceRecord) => {
    if (!canEditAttendance) return;
    const manualStatuses = ["ABSENT", "HOLIDAY", "WEEKEND", "LEAVE"];
    setEditData({
      _id: record._id,
      attendanceStatus: manualStatuses.includes(record.attendanceStatus)
        ? record.attendanceStatus
        : "AUTO",
      loginTime: record.loginTime,
      logoutTime: record.logoutTime,
      productiveMinutes: record.productiveMinutes,
      breakMinutes: record.breakMinutes,
      idleMinutes: record.idleMinutes,
      awayWorkingMinutes: record.awayWorkingMinutes,
      lateMinutes: record.lateMinutes,
      overtimeMinutes: record.overtimeMinutes,
      correctionReason: "",
    });
    setEditModalOpen(true);
  };

  const submitEdit = () => {
    if (!editData._id) return;
    const payload = { ...editData };
    if (payload.attendanceStatus === "AUTO") {
      delete payload.attendanceStatus;
    }
    updateRecord.mutate(payload);
  };

  const toLocalISOString = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
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

      <div className={`grid grid-cols-2 gap-4 mb-6 ${viewMode === "daily" ? "md:grid-cols-4 xl:grid-cols-8" : "md:grid-cols-5"}`}>
        {[
            ...(viewMode === "daily"
              ? [
                  {
                    label: "Logged In Now",
                    value: loggedInCount,
                    color: "text-blue-600",
                    filter: "LOGGED_IN",
                  },
                  {
                    label: "May Become Absent",
                    value: mayBecomeAbsentCount,
                    color: "text-rose-600",
                    filter: null,
                  },
                  {
                    label: "Not Full Day Yet",
                    value: notFullDayYetCount,
                    color: "text-amber-600",
                    filter: null,
                  },
                  {
                    label: "Crossed Half-Day Mark",
                    value: crossedHalfDayMarkCount,
                    color: "text-indigo-600",
                    filter: null,
                  },
                ]
              : []),
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
                filter ? setStatusFilter(statusFilter === filter ? null : filter) : undefined
              }
              className={`bg-white rounded-xl border p-4 text-center transition-all ${filter ? "cursor-pointer" : "cursor-default"} ${filter && statusFilter === filter ? "ring-2 ring-gray-900 border-transparent shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}
            >
              <p className={`text-2xl font-semibold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
            </div>
          ))}
      </div>

      {viewMode === "monthly" ? (
        <MonthlyShortfallPanel
          month={selectedMonth}
          employeeId={selectedEmployee || undefined}
          canReset={user?.role === "SUPER_ADMIN" || user?.role === "ADMIN"}
        />
      ) : null}

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
        ) : viewMode === "daily" ? (
          displayedList.length === 0 ? (
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
                    "Away",
                    "Late",
                    "OT",
                    ...(canEditAttendance ? ["Actions"] : []),
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
                      <div className="flex flex-col gap-1">
                        {record.sessions && record.sessions.length > 1 ? (
                          record.sessions.map((session: any, idx: number) => {
                            return (
                              <div key={idx} className="flex items-center gap-1 text-[11px] bg-slate-100 px-2 py-0.5 rounded w-fit border border-slate-200">
                                <span className="text-slate-400">#{idx + 1}</span>
                                {new Date(session.loginAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                {" - "}
                                {session.logoutAt ? (
                                  new Date(session.logoutAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                                ) : (
                                  "..."
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 text-[11px] bg-slate-100 px-2 py-0.5 rounded w-fit border border-slate-200">
                              {record.loginTime
                                ? new Date(record.loginTime).toLocaleTimeString(
                                    "en-IN",
                                    { hour: "2-digit", minute: "2-digit" },
                                  )
                                : "—"}
                              {" - "}
                              {record.logoutTime ? (
                                new Date(record.logoutTime).toLocaleTimeString(
                                  "en-IN",
                                  { hour: "2-digit", minute: "2-digit" },
                                )
                              ) : (
                                "..."
                              )}
                            </div>
                            {record.sessions && record.sessions.length > 0 && (
                              <span className="text-[10px] text-gray-400 font-medium pl-1">
                                (1 session)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatMinutes(record.productiveMinutes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatMinutes(record.breakMinutes)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.awayWorkingMinutes ?? 0}m
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {record.lateMinutes ? formatMinutes(record.lateMinutes) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {record.overtimeMinutes
                        ? formatMinutes(record.overtimeMinutes)
                        : "—"}
                    </td>
                    {canEditAttendance && (
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
          )
        ) : calendarEmployees.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No employees found to display.
          </div>
        ) : viewMode === "monthly" && selectedEmployee ? (
          <EmployeeCalendarView 
            employeeId={selectedEmployee} 
            recordsList={attendanceList} 
            leaveList={leaves || []} 
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 bg-gray-50 px-4 py-3 sticky left-0 z-10 whitespace-nowrap min-w-[150px] shadow-[1px_0_0_0_#f3f4f6]">
                    Employee
                  </th>
                  {calendarDates.map((date) => (
                    <th
                      key={date}
                      className="text-center text-xs font-medium text-gray-500 bg-gray-50 px-2 py-3 whitespace-nowrap min-w-[140px] border-l border-gray-100"
                    >
                      {new Date(date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarEmployees.map((emp) => {
                  const empTotalPresent = Object.values(emp.records).filter(
                    (r: any) =>
                      r.attendanceStatus === "PRESENT" ||
                      r.attendanceStatus === "LATE" ||
                      r.attendanceStatus === "HALF_DAY"
                  ).length;
                  return (
                  <tr
                    key={emp.employeeId}
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 sticky left-0 bg-white z-10 shadow-[1px_0_0_0_#f3f4f6]">
                      {emp.name} <br />{" "}
                      <span className="text-[11px] text-gray-400 font-normal">
                        {emp.employeeId}
                      </span>
                      <br />
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                        Total Present: {empTotalPresent}
                      </span>
                    </td>
                    {calendarDates.map((date) => {
                      const joinedOn = emp.createdAt
                        ? new Date(emp.createdAt).toLocaleDateString("en-CA")
                        : null;
                      const isBeforeJoin = !!joinedOn && date < joinedOn;
                      const record = isBeforeJoin ? null : emp.records[date];
                      const isFuture = !isPast(date) && !isToday(date);
                      const [y, m, d] = date.split("-").map(Number);
                      const isSunday = new Date(y, m - 1, d).getDay() === 0;

                      let displayStatus = record ? record.attendanceStatus : null;
                      if (!record && !isBeforeJoin) {
                        if (isSunday) {
                          displayStatus = "WEEKEND";
                        } else if (isPast(date)) {
                          displayStatus = "ABSENT";
                        }
                      }
                      
                      if (isFuture && displayStatus === "ABSENT") displayStatus = null; // hide future absents

                      const dTime = new Date(y, m - 1, d).getTime();
                      const leavesForDay = (leaves || []).filter((l: any) => {
                        if (l.employeeId !== emp.employeeId) return false;
                        const [sy, sm, sd] = l.startDate.split("-").map(Number);
                        const [ey, em, ed] = l.endDate.split("-").map(Number);
                        const sTime = new Date(sy, sm - 1, sd).getTime();
                        const eTime = new Date(ey, em - 1, ed).getTime();
                        return dTime >= sTime && dTime <= eTime;
                      });

                      return (
                        <td
                          key={date}
                          className={`px-2 py-2 border-l border-gray-50 text-center align-middle transition-colors ${
                            record && canEditAttendance ? "cursor-pointer hover:bg-gray-100" : ""
                          }`}
                          onClick={() => {
                            if (record && canEditAttendance) handleEditClick(record);
                          }}
                        >
                          {displayStatus ? (
                            <>
                              <div className="flex flex-col items-center gap-1.5">
                                {leavesForDay.map((leave: any) => (
                                  <span key={leave._id} className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                    leave.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 
                                    leave.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 
                                    'bg-rose-100 text-rose-700'
                                  }`}>
                                    LEAVE ({leave.status.slice(0,3)})
                                  </span>
                                ))}
                                {displayStatus && (
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${getStatusColor(
                                      displayStatus,
                                    )}`}
                                  >
                                    {displayStatus}
                                  </span>
                                )}
                                {record?.loginTime && (
                                  <div className="text-[10px] text-gray-500 whitespace-nowrap bg-gray-50 px-1.5 py-0.5 rounded">
                                    {new Date(record.loginTime).toLocaleTimeString(
                                      "en-IN",
                                      { hour: "2-digit", minute: "2-digit" },
                                    )}
                                    {" - "}
                                    {record.logoutTime ? (
                                      new Date(record.logoutTime).toLocaleTimeString(
                                        "en-IN",
                                        { hour: "2-digit", minute: "2-digit" },
                                      )
                                    ) : (
                                      "..."
                                    )}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center min-h-[40px]">
                              {leavesForDay.map((leave: any) => (
                                <span key={leave._id} className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase mb-1 ${
                                  leave.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 
                                  leave.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 
                                  'bg-rose-100 text-rose-700'
                                }`}>
                                  LEAVE ({leave.status.slice(0,3)})
                                </span>
                              ))}
                              {leavesForDay.length === 0 && (
                                <span
                                  className="text-gray-300 text-[10px]"
                                  title={isBeforeJoin ? "Before joining date" : undefined}
                                >
                                  —
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
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
                  Status override
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={editData.attendanceStatus || "AUTO"}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      attendanceStatus: e.target.value,
                    })
                  }
                >
                  <option value="AUTO">Auto from login time</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="WEEKEND">WEEKEND</option>
                  <option value="HOLIDAY">HOLIDAY</option>
                  <option value="LEAVE">LEAVE</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Present, late and half-day are calculated automatically from the corrected login time and the assigned shift.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Login Time
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={toLocalISOString(editData.loginTime as any)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setEditData({ ...editData, loginTime: "" as any });
                      } else {
                        const d = new Date(val);
                        if (!isNaN(d.getTime())) setEditData({ ...editData, loginTime: d.toISOString() });
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Logout Time
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={toLocalISOString(editData.logoutTime as any)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setEditData({ ...editData, logoutTime: "" as any });
                      } else {
                        const d = new Date(val);
                        if (!isNaN(d.getTime())) setEditData({ ...editData, logoutTime: d.toISOString() });
                      }
                    }}
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
                        productiveMinutes: parseFloat(e.target.value) || 0,
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
                        breakMinutes: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Idle (Mins)
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={editData.idleMinutes}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        idleMinutes: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Away (Mins)
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={editData.awayWorkingMinutes}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        awayWorkingMinutes: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                        lateMinutes: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Overtime (Mins)
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={editData.overtimeMinutes}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        overtimeMinutes: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                Changing login/logout will automatically recalculate the employee's attendance status. Use the status override only for Absent, Leave, Holiday or Weekend corrections.
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
