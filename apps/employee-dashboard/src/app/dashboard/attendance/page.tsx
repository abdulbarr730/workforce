"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatMinutes, getStatusColor } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, X, CheckCircle2, Hourglass, PartyPopper } from "lucide-react";

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
  expectedLogoutTime?: string;
}

interface LeaveRequest {
  _id: string;
  startDate: string;
  endDate: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface MonthlyShortfall {
  requiredMinutes: number;
  workedMinutes: number;
  rawShortfallMinutes: number;
  coveredByResetMinutes: number;
  shortfallMinutes: number;
  surplusMinutes: number;
  deficitDays: number;
  excludedOpenDays: number;
}

interface Holiday {
  _id: string;
  name: string;
  date: string;
  isActive?: boolean;
  appliesToAll?: boolean;
  excludedEmployeeIds?: string[];
}

const shortDuration = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export default function MyAttendanceCalendarPage() {
  const { user } = useAuthStore();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedStat, setSelectedStat] = useState<string | null>(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  const monthString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const { data: records, isLoading: loadingRecords } = useQuery({
    queryKey: ["my-attendance", user?.employeeId, monthString],
    queryFn: () =>
      api
        .get(
          `/api/attendance/records?employeeId=${user?.employeeId}&month=${monthString}`,
        )
        .then((r) => r.data.data),
    enabled: !!user?.employeeId,
  });

  const { data: leaves, isLoading: loadingLeaves } = useQuery({
    queryKey: ["my-leaves", user?.employeeId],
    queryFn: () => api.get("/api/attendance/time-off/leaves/mine").then((r) => r.data.data),
    enabled: !!user?.employeeId,
  });

  const { data: shortfallResponse, isLoading: loadingShortfall } = useQuery({
    queryKey: ["my-attendance-shortfall", user?.employeeId, monthString],
    queryFn: () =>
      api
        .get(`/api/attendance/shortfall?month=${monthString}`)
        .then((response) => response.data.data as { employees: MonthlyShortfall[] }),
    enabled: !!user?.employeeId,
    staleTime: 30_000,
  });

  const { data: holidays } = useQuery({
    queryKey: ["attendance-holidays"],
    queryFn: () =>
      api
        .get("/api/attendance/time-off/holidays")
        .then((response) => response.data.data as Holiday[]),
    staleTime: 60_000,
  });

  const list: AttendanceRecord[] = records ?? [];
  const leaveList: LeaveRequest[] = leaves ?? [];
  const holidayList: Holiday[] = (holidays ?? []).filter(
    (holiday) =>
      holiday.isActive !== false &&
      !(holiday.excludedEmployeeIds || []).includes(user?.employeeId || ""),
  );
  const monthlyShortfall = shortfallResponse?.employees?.[0];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = [
    todayStart.getFullYear(),
    String(todayStart.getMonth() + 1).padStart(2, "0"),
    String(todayStart.getDate()).padStart(2, "0"),
  ].join("-");
  const upcomingHolidays = holidayList
    .filter((holiday) => holiday.date >= todayStr)
    .slice(0, 4);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
    
    const days = [];
    
    // Previous month filler days
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(currentYear, currentMonth - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(currentYear, currentMonth, i),
        isCurrentMonth: true,
      });
    }
    
    // Next month filler days (to complete the grid of 42 cells - 6 weeks)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(currentYear, currentMonth + 1, i),
        isCurrentMonth: false,
      });
    }
    
    return days;
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const isDateInLeave = (dateObj: Date, leave: LeaveRequest) => {
    // Zero out time for accurate comparison
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
    
    const startParts = leave.startDate.split("-");
    const endParts = leave.endDate.split("-");
    
    const s = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2])).getTime();
    const e = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2])).getTime();
    
    return d >= s && d <= e;
  };

  const getLeavesForDate = (dateObj: Date) => {
    return leaveList.filter(leave => isDateInLeave(dateObj, leave));
  };

  const dateKey = (dateObj: Date) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getRecordForDate = (dateObj: Date) => {
    const dateStr = dateKey(dateObj);
    return list.find(r => r.date === dateStr);
  };

  const getHolidayForDate = (dateObj: Date) => {
    const dateStr = dateKey(dateObj);
    return holidayList.find((holiday) => holiday.date === dateStr);
  };

  // Stats
  const present = list.filter((r) => r.attendanceStatus === "PRESENT").length;
  const late = list.filter((r) => r.attendanceStatus === "LATE").length;
  const halfDay = list.filter((r) => r.attendanceStatus === "HALF_DAY").length;
  const totalPresent = present + late + halfDay;
  const absent = list.filter((r) => r.attendanceStatus === "ABSENT" && new Date(r.date).getDay() !== 0).length;

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-indigo-600" />
            My Attendance Calendar
          </h1>
          <p className="text-slate-500 mt-1">Track your daily attendance and leave requests</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
          <button 
            onClick={handlePrevMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-40 text-center font-semibold text-slate-800">
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </div>
          <button 
            onClick={handleNextMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {upcomingHolidays.length > 0 && (
        <section className="mb-6 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
                <PartyPopper className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Upcoming holiday calendar
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  {upcomingHolidays[0].name}
                </h2>
                <p className="text-sm text-slate-500">
                  {new Date(`${upcomingHolidays[0].date}T00:00:00`).toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {upcomingHolidays.slice(1).map((holiday) => (
                <span
                  key={holiday._id}
                  className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
                >
                  {holiday.name} ·{" "}
                  {new Date(`${holiday.date}T00:00:00`).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <section
        className={`relative z-0 mb-6 overflow-hidden rounded-2xl border shadow-sm ${
          monthlyShortfall?.shortfallMinutes
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50"
        }`}
      >
        {loadingShortfall ? (
          <div className="p-5 text-sm text-slate-500">
            Calculating this month&apos;s hours&hellip;
          </div>
        ) : monthlyShortfall ? (
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span
                className={`rounded-xl p-2.5 ${
                  monthlyShortfall.shortfallMinutes
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {monthlyShortfall.shortfallMinutes ? (
                  <Hourglass className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Monthly hours balance
                </p>
                <h2
                  className={`mt-1 text-2xl font-bold ${
                    monthlyShortfall.shortfallMinutes
                      ? "text-amber-800"
                      : "text-emerald-800"
                  }`}
                >
                  {monthlyShortfall.shortfallMinutes
                    ? `${shortDuration(monthlyShortfall.shortfallMinutes)} to cover`
                    : monthlyShortfall.surplusMinutes
                      ? `${shortDuration(monthlyShortfall.surplusMinutes)} ahead`
                      : "No hours to cover"}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Extra tracked time automatically offsets shorter days in this month.
                  {monthlyShortfall.excludedOpenDays > 0
                    ? " Your open shift is not counted yet."
                    : ""}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Required", shortDuration(monthlyShortfall.requiredMinutes)],
                ["Tracked", shortDuration(monthlyShortfall.workedMinutes)],
                ["Deficit days", String(monthlyShortfall.deficitDays)],
                ["Admin covered", shortDuration(monthlyShortfall.coveredByResetMinutes)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="min-w-24 rounded-xl border border-white/80 bg-white/70 px-3 py-2"
                >
                  <p className="text-sm font-bold text-slate-800">{value}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-500">
            No attendance hours are recorded for this month yet.
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Total Present", value: totalPresent, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-100" },
          { label: "Present", value: present, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
          { label: "Late", value: late, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
          { label: "Half Day", value: halfDay, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100" },
          { label: "Absent", value: absent, color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-100" },
        ].map(({ label, value, color, bg, border }) => (
          <div 
            key={label} 
            onClick={() => setSelectedStat(label)}
            className={`rounded-2xl border ${border} ${bg} p-4 flex flex-col items-center justify-center shadow-sm text-center cursor-pointer hover:shadow-md transition-all hover:scale-[1.02]`}
          >
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs font-semibold text-slate-600 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Calendar Header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
            <div key={day} className={`text-center py-3 text-xs font-bold uppercase tracking-wider ${i === 0 ? 'text-rose-500' : 'text-slate-500'}`}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 bg-slate-200 gap-[1px]">
          {calendarDays.map((dayObj, i) => {
            const date = dayObj.date;
            const isSunday = date.getDay() === 0;
            const isToday = new Date().toDateString() === date.toDateString();
            const record = getRecordForDate(date);
            const leavesForDay = getLeavesForDate(date);
            const holiday = getHolidayForDate(date);
            
            return (
              <div 
                key={i} 
                className={`min-h-[120px] p-2 flex flex-col bg-white transition-colors
                  ${!dayObj.isCurrentMonth ? 'opacity-40 bg-slate-50/50' : ''}
                  ${isSunday && dayObj.isCurrentMonth ? 'bg-rose-50/20' : ''}
                  ${isToday ? 'ring-2 ring-inset ring-indigo-500 bg-indigo-50/10' : ''}
                  hover:bg-slate-50
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full
                    ${isToday ? 'bg-indigo-600 text-white' : isSunday ? 'text-rose-500' : 'text-slate-700'}
                  `}>
                    {date.getDate()}
                  </span>
                  
                  {holiday ? (
                    <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-indigo-700 shadow-sm">
                      Holiday
                    </span>
                  ) : record ? (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md shadow-sm ${getStatusColor(record.attendanceStatus)}`}>
                      {record.attendanceStatus}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5 mt-auto">
                  {holiday && (
                    <div className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                      🎉 {holiday.name}
                    </div>
                  )}

                  {/* Leaves taking priority over attendance visual clutter */}
                  {leavesForDay.map(leave => (
                    <div key={leave._id} className={`text-[10px] font-semibold px-2 py-1 rounded-md flex items-center gap-1 border
                      ${leave.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                        leave.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                        'bg-rose-50 text-rose-700 border-rose-200'}
                    `}>
                      {leave.status === 'APPROVED' ? '🏝️ Leave' : leave.status === 'PENDING' ? '⏳ Pending Leave' : '❌ Leave Rejected'}
                    </div>
                  ))}

                  {/* Attendance Stats */}
                  {record && record.attendanceStatus !== 'ABSENT' && record.attendanceStatus !== 'HOLIDAY' && record.attendanceStatus !== 'WEEKEND' && (
                    <div className="space-y-1 mt-1">
                      {record.loginTime && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-600 bg-slate-50 p-1 rounded border border-slate-100">
                          <Clock className="w-3 h-3 text-indigo-400" />
                          <span>
                            {new Date(record.loginTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            {" - "}
                            {record.logoutTime ? (
                              new Date(record.logoutTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                            ) : (
                              "..."
                            )}
                          </span>
                        </div>
                      )}
                      
                      {record.productiveMinutes > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50/50 p-1 rounded border border-emerald-100/50">
                          <span className="font-medium">{formatMinutes(record.productiveMinutes)}</span> 
                          <span className="opacity-75">productive</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!record && dayObj.isCurrentMonth && !holiday && leavesForDay.length === 0 && date < todayStart && (
                    <div className="text-[10px] text-slate-400 font-semibold px-1">
                      —
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedStat && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-indigo-600" />
                {selectedStat} Days
              </h3>
              <button 
                onClick={() => setSelectedStat(null)}
                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="space-y-2">
                {(() => {
                  const datesForStat = calendarDays
                    .filter((dayObj) => dayObj.isCurrentMonth)
                    .filter((dayObj) => {
                      const date = dayObj.date;
                      const isSunday = date.getDay() === 0;
                      // Normalize today to start of day for accurate past comparison
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      const isPastDay = date < today;
                      const record = getRecordForDate(date);
                      const leaves = getLeavesForDate(date);
              
                      if (selectedStat === "Total Present") {
                        return record && ["PRESENT", "LATE", "HALF_DAY"].includes(record.attendanceStatus);
                      }
                      if (selectedStat === "Present") {
                        return record && record.attendanceStatus === "PRESENT";
                      }
                      if (selectedStat === "Late") {
                        return record && record.attendanceStatus === "LATE";
                      }
                      if (selectedStat === "Half Day") {
                        return record && record.attendanceStatus === "HALF_DAY";
                      }
                      if (selectedStat === "Absent") {
                        if (isSunday) return false;
                        if (record && record.attendanceStatus === "ABSENT") return true;
                        return false;
                      }
                      return false;
                    })
                    .map(d => d.date);
                    
                  if (datesForStat.length === 0) {
                    return <p className="text-center text-slate-500 py-8 text-sm">No days match this category.</p>;
                  }

                  return datesForStat.map((date, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                      <span className="font-medium text-slate-700">
                        {date.toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric' })}
                      </span>
                      {selectedStat !== "Absent" && (
                        <div className="flex gap-2">
                          {getRecordForDate(date)?.loginTime && (
                            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-medium border border-indigo-100">
                              In: {new Date(getRecordForDate(date)!.loginTime!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                          {getRecordForDate(date)?.logoutTime && (
                            <span className="text-xs bg-pink-50 text-pink-700 px-2 py-1 rounded-md font-medium border border-pink-100">
                              Out: {new Date(getRecordForDate(date)!.logoutTime!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
