"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatDate } from "@/lib/utils";
import { Plus, X, Calendar as CalendarIcon, List, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfDay } from "date-fns";

interface LeaveRequest {
  _id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

const LEAVE_TYPES = ["CASUAL", "SICK", "ANNUAL", "EMERGENCY", "UNPAID"];
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  APPROVED: "bg-green-50 text-green-700 border-green-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

function CalendarView({ leaves, onDateClick, onLeaveClick }: { leaves: LeaveRequest[], onDateClick: (d: Date) => void, onLeaveClick: (l: LeaveRequest) => void }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-4 flex items-center justify-between border-b border-gray-100 bg-white/50">
        <h2 className="text-lg font-semibold text-gray-900">{format(currentDate, "MMMM yyyy")}</h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/80">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 bg-white/50">
        {days.map((day, i) => {
          const isCurrentMonth = isSameMonth(day, monthStart);
          
          const dayLeaves = leaves.filter(l => {
            const lStart = startOfDay(new Date(l.startDate));
            const lEnd = startOfDay(new Date(l.endDate));
            const current = startOfDay(day);
            return current >= lStart && current <= lEnd;
          });

          return (
            <div 
              key={i} 
              onClick={() => onDateClick(day)}
              className={`min-h-[110px] border-b border-r border-gray-100 p-2 transition-colors cursor-pointer ${!isCurrentMonth ? "bg-gray-50/50 text-gray-400 hover:bg-gray-100/50" : "bg-white hover:bg-indigo-50/50"}`}
            >
              <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1.5 ${isSameDay(day, new Date()) ? 'bg-indigo-600 text-white shadow-md' : ''}`}>
                {format(day, "d")}
              </div>
              <div className="flex flex-col gap-1.5">
                {dayLeaves.map(leave => (
                  <div 
                    key={leave._id} 
                    onClick={(e) => { e.stopPropagation(); onLeaveClick(leave); }}
                    className={`text-[10px] px-1.5 py-1 rounded font-medium border leading-tight truncate cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLORS[leave.status] || 'bg-gray-100'}`}
                  >
                    {leave.type}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MyLeavesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [editingLeave, setEditingLeave] = useState<LeaveRequest | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: "CASUAL",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const { data: leaves, isLoading } = useQuery({
    queryKey: ["my-leaves", user?.employeeId],
    queryFn: () =>
      api.get("/api/attendance/time-off/leaves/mine").then((r) => r.data.data),
    enabled: !!user,
  });

  const requestLeave = useMutation({
    mutationFn: (payload: typeof form) =>
      api.post("/api/attendance/time-off/leaves/request", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-leaves"] });
      setShowForm(false);
      setForm({ type: "CASUAL", startDate: "", endDate: "", reason: "" });
    },
  });

  const updateLeave = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: typeof form }) =>
      api.put(`/api/attendance/time-off/leaves/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-leaves"] });
      setShowForm(false);
      setEditingLeave(null);
      setForm({ type: "CASUAL", startDate: "", endDate: "", reason: "" });
    },
  });

  const deleteLeave = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/attendance/time-off/leaves/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-leaves"] });
      setShowForm(false);
      setEditingLeave(null);
      setForm({ type: "CASUAL", startDate: "", endDate: "", reason: "" });
    },
  });

  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const leaveList: LeaveRequest[] = leaves ?? [];

  const handleDateClick = (date: Date) => {
    setEditingLeave(null);
    const dateStr = format(date, "yyyy-MM-dd");
    setForm({ ...form, startDate: dateStr, endDate: dateStr, reason: "", type: "CASUAL" });
    setShowForm(true);
  };

  const handleLeaveClick = (leave: LeaveRequest) => {
    setEditingLeave(leave);
    setForm({
      type: leave.type,
      startDate: format(new Date(leave.startDate), "yyyy-MM-dd"),
      endDate: format(new Date(leave.endDate), "yyyy-MM-dd"),
      reason: leave.reason,
    });
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Leave Requests
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {leaveList.filter((l) => l.status === "PENDING").length} pending
          </p>
        </div>
        
        <div className="flex gap-3 items-center">
          <div className="bg-white border border-gray-200 rounded-lg p-1 flex shadow-sm">
            <button onClick={() => setViewMode("calendar")} className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-2 transition-colors ${viewMode === "calendar" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-500 hover:text-gray-900"}`}>
              <CalendarIcon className="w-4 h-4" /> Calendar
            </button>
            <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-2 transition-colors ${viewMode === "list" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-500 hover:text-gray-900"}`}>
              <List className="w-4 h-4" /> List
            </button>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white font-medium text-sm rounded-lg shadow-sm hover:bg-gray-800 transition-all hover:scale-105"
          >
            <Plus className="w-4 h-4" /> Request Leave
          </button>
        </div>
      </div>

      {viewMode === "calendar" ? (
        <CalendarView leaves={leaveList} onDateClick={handleDateClick} onLeaveClick={handleLeaveClick} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Loading...
          </div>
        ) : leaveList.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No leave requests yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Type", "From", "To", "Reason", "Status"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-gray-500 px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaveList.map((leave) => (
                  <tr
                    key={leave._id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {leave.type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(leave.startDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(leave.endDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                      {leave.reason}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[leave.status]}`}
                      >
                        {leave.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">
                Request Leave
              </h2>
              <button
                onClick={() => { setShowForm(false); setEditingLeave(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingLeave) {
                  updateLeave.mutate({ id: editingLeave._id, payload: form });
                } else {
                  requestLeave.mutate(form);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Leave Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  disabled={editingLeave !== null && editingLeave.status !== "PENDING"}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    From
                  </label>
                  <input
                    type="date"
                    required
                    value={form.startDate}
                    disabled={editingLeave !== null && editingLeave.status !== "PENDING"}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    To
                  </label>
                  <input
                    type="date"
                    required
                    value={form.endDate}
                    disabled={editingLeave !== null && editingLeave.status !== "PENDING"}
                    onChange={(e) =>
                      setForm({ ...form, endDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <textarea
                  required
                  value={form.reason}
                  disabled={editingLeave !== null && editingLeave.status !== "PENDING"}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  placeholder="Brief reason for leave"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingLeave(null); }}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  {editingLeave && editingLeave.status !== "PENDING" ? "Close" : "Cancel"}
                </button>
                {editingLeave && editingLeave.status === "PENDING" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Are you sure you want to delete this leave request?")) {
                        deleteLeave.mutate(editingLeave._id);
                      }
                    }}
                    disabled={deleteLeave.isPending}
                    className="flex-1 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleteLeave.isPending ? "Deleting..." : "Delete"}
                  </button>
                )}
                {(!editingLeave || editingLeave.status === "PENDING") && (
                  <button
                    type="submit"
                    disabled={requestLeave.isPending || updateLeave.isPending}
                    className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {requestLeave.isPending || updateLeave.isPending ? "Submitting..." : editingLeave ? "Update" : "Submit"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
