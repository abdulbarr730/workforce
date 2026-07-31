"use client";
import { useState, useMemo } from "react";
import { formatMinutes, getStatusColor } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, AlertCircle, X } from "lucide-react";

export function EmployeeCalendarView({ 
  employeeId, 
  recordsList, 
  leaveList 
}: { 
  employeeId: string, 
  recordsList: any[], 
  leaveList: any[] 
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedStat, setSelectedStat] = useState<string | null>(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); 
    
    const days = [];
    
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(currentYear, currentMonth - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(currentYear, currentMonth, i),
        isCurrentMonth: true,
      });
    }
    
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(currentYear, currentMonth + 1, i),
        isCurrentMonth: false,
      });
    }
    
    return days;
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));

  const isDateInLeave = (dateObj: Date, leave: any) => {
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
    const startParts = leave.startDate.split("-");
    const endParts = leave.endDate.split("-");
    const s = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2])).getTime();
    const e = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2])).getTime();
    return d >= s && d <= e;
  };

  const getLeavesForDate = (dateObj: Date) => {
    return leaveList.filter(leave => leave.employeeId === employeeId && isDateInLeave(dateObj, leave));
  };

  const getRecordForDate = (dateObj: Date) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    return recordsList.find(r => r.date === dateStr && r.employeeId === employeeId);
  };

  const present = recordsList.filter((r) => r.employeeId === employeeId && r.attendanceStatus === "PRESENT").length;
  const late = recordsList.filter((r) => r.employeeId === employeeId && r.attendanceStatus === "LATE").length;
  const halfDay = recordsList.filter((r) => r.employeeId === employeeId && r.attendanceStatus === "HALF_DAY").length;
  const totalPresent = present + late + halfDay;
  const absent = recordsList.filter((r) => r.employeeId === employeeId && r.attendanceStatus === "ABSENT" && new Date(r.date).getDay() !== 0).length;

  return (
    <div className="pb-12 mt-6">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            Detailed Calendar View
          </h2>
          <p className="text-sm text-slate-500 mt-1">Viewing calendar for employee: {employeeId}</p>
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
            className={`rounded-xl border ${border} ${bg} p-4 flex flex-col items-center justify-center shadow-sm text-center cursor-pointer hover:shadow-md transition-all hover:scale-[1.02]`}
          >
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs font-semibold text-slate-600 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
            <div key={day} className={`text-center py-2 text-[10px] font-bold uppercase tracking-wider ${i === 0 ? 'text-rose-500' : 'text-slate-500'}`}>
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 bg-slate-200 gap-[1px]">
          {calendarDays.map((dayObj, i) => {
            const date = dayObj.date;
            const isSunday = date.getDay() === 0;
            const isToday = new Date().toDateString() === date.toDateString();
            const record = getRecordForDate(date);
            const leavesForDay = getLeavesForDate(date);
            
            return (
              <div 
                key={i} 
                className={`min-h-[100px] p-2 flex flex-col bg-white transition-colors
                  ${!dayObj.isCurrentMonth ? 'opacity-40 bg-slate-50/50' : ''}
                  ${isSunday && dayObj.isCurrentMonth ? 'bg-rose-50/20' : ''}
                  ${isToday ? 'ring-2 ring-inset ring-indigo-500 bg-indigo-50/10' : ''}
                  hover:bg-slate-50
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
                    ${isToday ? 'bg-indigo-600 text-white' : isSunday ? 'text-rose-500' : 'text-slate-700'}
                  `}>
                    {date.getDate()}
                  </span>
                  
                  {record && (
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm ${getStatusColor(record.attendanceStatus)}`}>
                      {record.attendanceStatus}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1 mt-auto">
                  {leavesForDay.map(leave => (
                    <div key={leave._id} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 border
                      ${leave.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                        leave.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                        'bg-rose-50 text-rose-700 border-rose-200'}
                    `}>
                      {leave.status === 'APPROVED' ? '🏝️ Leave' : leave.status === 'PENDING' ? '⏳ Pending Leave' : '❌ Leave Rejected'}
                    </div>
                  ))}

                  {record && record.attendanceStatus !== 'ABSENT' && (
                    <div className="space-y-0.5 mt-1">
                      {record.loginTime && (
                        <div className="flex items-center gap-1 text-[9px] text-slate-600 bg-slate-50 p-1 rounded border border-slate-100">
                          <Clock className="w-2.5 h-2.5 text-indigo-400" />
                          <span>
                            {new Date(record.loginTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            {" - "}
                            {record.logoutTime ? (
                              new Date(record.logoutTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                            ) : record.expectedLogoutTime && (date < new Date(new Date().setHours(0,0,0,0)) || new Date() > new Date(record.expectedLogoutTime)) ? (
                              <span title="Expected">
                                {new Date(record.expectedLogoutTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            ) : date < new Date(new Date().setHours(0,0,0,0)) ? (
                              <span title="Expected (Default)">06:30 pm</span>
                            ) : (
                              "..."
                            )}
                          </span>
                        </div>
                      )}
                      
                      {record.productiveMinutes > 0 && (
                        <div className="flex items-center gap-1 text-[9px] text-emerald-700 bg-emerald-50/50 p-1 rounded border border-emerald-100/50">
                          <span className="font-medium">{formatMinutes(record.productiveMinutes)}</span> 
                          <span className="opacity-75">productive</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!record && dayObj.isCurrentMonth && !isSunday && date < new Date() && leavesForDay.length === 0 && (
                    <div className="text-[9px] text-rose-500 font-medium px-1 flex items-center gap-1">
                      <AlertCircle className="w-2.5 h-2.5" /> Absent
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
                        if (!record && isPastDay && leaves.length === 0) return true;
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
