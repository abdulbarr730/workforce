"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Plus,
  X,
  Clock,
  Calendar,
  AlertTriangle,
  Coffee,
  Briefcase,
  Edit2,
  CheckCircle2,
  User as UserIcon,
  Trash2,
} from "lucide-react";

interface ShiftPolicy {
  _id: string;
  name: string;
  description?: string;
  activeDays: string[];
  shiftType: "REGULAR" | "LATE" | "HALF_DAY";
  shiftStartTime: string;
  shiftEndTime: string;
  loginCutoffTime: string;
  halfDayAfterTime: string;
  absentAfterTime: string;
  minimumWorkMinutes: number;
  overtimeEnabled: boolean;
  overtimeAfterMinutes: number;
  eodTriggerTime: string;
  breakDeductionEnabled: boolean;
  defaultBreakMinutes: number;
  isDefault: boolean;
}

interface User {
  _id: string;
  name: string;
  employeeId: string;
  role: string;
  assignedShiftPolicyId?: string;
  assignedShiftPolicyName?: string;
}

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export default function ShiftsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"POLICIES" | "ASSIGNMENTS">(
    "POLICIES",
  );
  const [showForm, setShowForm] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ShiftPolicy>>({
    name: "",
    description: "",
    activeDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    shiftType: "REGULAR",
    shiftStartTime: "10:00",
    shiftEndTime: "18:30",
    loginCutoffTime: "10:30",
    halfDayAfterTime: "14:00",
    absentAfterTime: "16:00",
    minimumWorkMinutes: 480,
    overtimeEnabled: false,
    overtimeAfterMinutes: 480,
    eodTriggerTime: "23:59",
    breakDeductionEnabled: false,
    defaultBreakMinutes: 45,
    isDefault: false,
  });

  const { data: shifts, isLoading: shiftsLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.get("/api/attendance/shifts").then((r) => r.data.data),
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
    enabled: activeTab === "ASSIGNMENTS",
  });

  const createShift = useMutation({
    mutationFn: (payload: Partial<ShiftPolicy>) =>
      api.post("/api/attendance/shifts", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      setShowForm(false);
      resetForm();
    },
  });

  const updateShift = useMutation({
    mutationFn: (payload: Partial<ShiftPolicy>) =>
      api.put(`/api/attendance/shifts/${editingPolicyId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      resetForm();
    },
  });

  const assignShift = useMutation({
    mutationFn: ({
      employeeId,
      shiftPolicyId,
    }: {
      employeeId: string;
      shiftPolicyId: string;
    }) =>
      api.post("/api/attendance/shifts/assign", { employeeId, shiftPolicyId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const deleteShift = useMutation({
    mutationFn: (id: string) => api.delete(`/api/attendance/shifts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const resetForm = () => {
    setEditingPolicyId(null);
    setForm({
      name: "",
      description: "",
      activeDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      shiftType: "REGULAR",
      shiftStartTime: "10:00",
      shiftEndTime: "18:30",
      loginCutoffTime: "10:30",
      halfDayAfterTime: "14:00",
      absentAfterTime: "16:00",
      minimumWorkMinutes: 480,
      overtimeEnabled: false,
      overtimeAfterMinutes: 480,
      eodTriggerTime: "23:59",
      breakDeductionEnabled: false,
      defaultBreakMinutes: 45,
      isDefault: false,
    });
  };

  const handleEdit = (policy: ShiftPolicy) => {
    setEditingPolicyId(policy._id);
    setForm({ ...policy });
    setShowForm(true);
  };

  const shiftList: ShiftPolicy[] = shifts ?? [];
  const userList: User[] = (users ?? []).filter(
    (u: User) => u.role !== "ADMIN" && u.role !== "SUPER_ADMIN",
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Shift Configuration
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Create shift policies and assign them to employees.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-200/50 p-1 rounded-xl items-center shadow-inner">
            <button
              onClick={() => setActiveTab("POLICIES")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === "POLICIES" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Policies
            </button>
            <button
              onClick={() => setActiveTab("ASSIGNMENTS")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === "ASSIGNMENTS" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Assignments
            </button>
          </div>
          {activeTab === "POLICIES" && (
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all"
            >
              <Plus size={18} strokeWidth={2.5} /> New Policy
            </button>
          )}
        </div>
      </div>

      {activeTab === "POLICIES" ? (
        shiftsLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {shiftList.map((shift) => (
              <div
                key={shift._id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="bg-slate-50 border-b border-slate-100 p-5 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-bold text-slate-800">
                        {shift.name}
                      </h3>
                      {shift.isDefault && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold uppercase tracking-wider border border-emerald-200">
                          Default
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border ${
                          shift.shiftType === "REGULAR"
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : shift.shiftType === "HALF_DAY"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {shift.shiftType}
                      </span>
                    </div>
                    {shift.description && (
                      <p className="text-sm text-slate-500 font-medium">
                        {shift.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(shift)}
                      className="p-2 bg-white border border-slate-200 text-slate-500 rounded-lg shadow-sm hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            "Are you sure you want to delete this shift policy?",
                          )
                        ) {
                          deleteShift.mutate(shift._id);
                        }
                      }}
                      disabled={shift.isDefault || deleteShift.isPending}
                      className="p-2 bg-white border border-slate-200 text-slate-500 rounded-lg shadow-sm hover:text-rose-600 hover:border-rose-200 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="p-5 grid grid-cols-2 gap-x-4 gap-y-6">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      <Clock size={14} /> Schedule
                    </div>
                    <div className="text-slate-800 font-bold text-base mb-1">
                      {shift.shiftStartTime} - {shift.shiftEndTime}
                    </div>
                    <div className="flex gap-1 flex-wrap mt-2">
                      {DAYS.map((d) => (
                        <span
                          key={d}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${shift.activeDays.includes(d) ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-400"}`}
                        >
                          {d.substring(0, 3)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      <AlertTriangle size={14} /> Cutoffs
                    </div>
                    <div className="space-y-1.5 text-sm font-medium">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Late:</span>{" "}
                        <span className="text-amber-600 font-bold">
                          {shift.loginCutoffTime}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Half Day:</span>{" "}
                        <span className="text-orange-600 font-bold">
                          {shift.halfDayAfterTime}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Absent:</span>{" "}
                        <span className="text-rose-600 font-bold">
                          {shift.absentAfterTime}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      <Briefcase size={14} /> Work Hours
                    </div>
                    <div className="space-y-1.5 text-sm font-medium">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Min. Hours:</span>{" "}
                        <span className="text-slate-800 font-bold">
                          {Math.floor(shift.minimumWorkMinutes / 60)}h{" "}
                          {shift.minimumWorkMinutes % 60}m
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">EOD Trigger:</span>{" "}
                        <span className="text-slate-800 font-bold">
                          {shift.eodTriggerTime}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      <Coffee size={14} /> Breaks
                    </div>
                    <div className="text-sm font-medium">
                      {shift.breakDeductionEnabled ? (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Deduction:</span>{" "}
                          <span className="text-slate-800 font-bold">
                            {shift.defaultBreakMinutes} min
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">
                          No automated deductions
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {shiftList.length === 0 && (
              <div className="col-span-2 p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300 font-medium">
                No shift policies configured. Click "New Policy" to set up your
                rules.
              </div>
            )}
          </div>
        )
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <UserIcon size={16} className="text-indigo-500" /> Employee
              Assignments
            </h2>
          </div>
          {usersLoading ? (
            <div className="p-12 text-center">
              <div className="w-6 h-6 mx-auto border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Employee ID</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Assigned Shift Policy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userList.map((user) => {
                    const defaultPolicy = shiftList.find((s) => s.isDefault);
                    return (
                      <tr
                        key={user._id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">
                            {user.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-500">
                          {user.employeeId}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="relative flex items-center">
                            <select
                              value={user.assignedShiftPolicyId || ""}
                              onChange={(e) =>
                                assignShift.mutate({
                                  employeeId: user.employeeId,
                                  shiftPolicyId: e.target.value,
                                })
                              }
                              className="appearance-none w-full max-w-[250px] bg-white border border-slate-200 text-sm font-bold text-slate-700 py-2 pl-3 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all disabled:opacity-50"
                              disabled={assignShift.isPending}
                            >
                              <option value="">
                                (Default: {defaultPolicy?.name || "None"})
                              </option>
                              {shiftList.map((shift) => (
                                <option key={shift._id} value={shift._id}>
                                  {shift.name}
                                </option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M19 9l-7 7-7-7"
                                ></path>
                              </svg>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Slide-over Form */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-end z-50">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {editingPolicyId ? "Edit Shift Policy" : "New Shift Policy"}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Configure active days, timing, and automated cutoffs.
                </p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                editingPolicyId
                  ? updateShift.mutate(form)
                  : createShift.mutate(form);
              }}
              className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar"
            >
              {/* General Section */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest border-b border-slate-100 pb-2">
                  General Details
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Policy Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Saturday Half Day"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Short description"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Shift Type
                    </label>
                    <select
                      value={form.shiftType}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          shiftType: e.target.value as
                            | "REGULAR"
                            | "LATE"
                            | "HALF_DAY",
                        })
                      }
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-white"
                    >
                      <option value="REGULAR">REGULAR</option>
                      <option value="LATE">LATE</option>
                      <option value="HALF_DAY">HALF_DAY</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 p-2">
                      <input
                        type="checkbox"
                        checked={form.isDefault}
                        onChange={(e) =>
                          setForm({ ...form, isDefault: e.target.checked })
                        }
                        className="rounded w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />
                      Set as Default
                    </label>
                  </div>
                </div>
              </section>

              {/* Schedule Section */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest border-b border-slate-100 pb-2">
                  Schedule & Timing
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    Active Working Days
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS.map((d) => (
                      <button
                        type="button"
                        key={d}
                        onClick={() =>
                          setForm({
                            ...form,
                            activeDays: form.activeDays!.includes(d)
                              ? form.activeDays!.filter((x) => x !== d)
                              : [...form.activeDays!, d],
                          })
                        }
                        className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${form.activeDays!.includes(d) ? "bg-slate-800 text-white shadow-md shadow-slate-300" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                      >
                        {d.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Start Time (HH:mm)
                    </label>
                    <input
                      type="time"
                      required
                      value={form.shiftStartTime}
                      onChange={(e) =>
                        setForm({ ...form, shiftStartTime: e.target.value })
                      }
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      End Time (HH:mm)
                    </label>
                    <input
                      type="time"
                      required
                      value={form.shiftEndTime}
                      onChange={(e) =>
                        setForm({ ...form, shiftEndTime: e.target.value })
                      }
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>
                </div>
              </section>

              {/* Cutoffs Section */}
              <section className="space-y-4 bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50">
                <h3 className="text-xs font-bold text-amber-600 uppercase tracking-widest border-b border-amber-100 pb-2 flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Late & Half-Day Cutoffs
                </h3>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5 leading-tight">
                      Mark Late If Login After
                    </label>
                    <input
                      type="time"
                      required
                      value={form.loginCutoffTime}
                      onChange={(e) =>
                        setForm({ ...form, loginCutoffTime: e.target.value })
                      }
                      className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5 leading-tight">
                      Half Day If Login After
                    </label>
                    <input
                      type="time"
                      required
                      value={form.halfDayAfterTime}
                      onChange={(e) =>
                        setForm({ ...form, halfDayAfterTime: e.target.value })
                      }
                      className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5 leading-tight">
                      Absent If Login After
                    </label>
                    <input
                      type="time"
                      required
                      value={form.absentAfterTime}
                      onChange={(e) =>
                        setForm({ ...form, absentAfterTime: e.target.value })
                      }
                      className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                    />
                  </div>
                </div>
              </section>

              {/* Hours & Breaks Section */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <Briefcase size={14} /> Work Hours & Breaks
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Minimum Work (Minutes)
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={form.minimumWorkMinutes}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          minimumWorkMinutes: Number(e.target.value),
                        })
                      }
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                    <p className="text-[10px] text-slate-400 font-medium mt-1">
                      {Math.floor(form.minimumWorkMinutes! / 60)}h{" "}
                      {form.minimumWorkMinutes! % 60}m
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      End Of Day Trigger (HH:mm)
                    </label>
                    <input
                      type="time"
                      required
                      value={form.eodTriggerTime}
                      onChange={(e) =>
                        setForm({ ...form, eodTriggerTime: e.target.value })
                      }
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2">
                      <input
                        type="checkbox"
                        checked={form.breakDeductionEnabled}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            breakDeductionEnabled: e.target.checked,
                          })
                        }
                        className="rounded w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />
                      Auto-Deduct Break
                    </label>
                    <input
                      type="number"
                      min="0"
                      disabled={!form.breakDeductionEnabled}
                      value={form.defaultBreakMinutes}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          defaultBreakMinutes: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-400 disabled:opacity-50 disabled:bg-slate-100"
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2">
                      <input
                        type="checkbox"
                        checked={form.overtimeEnabled}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            overtimeEnabled: e.target.checked,
                          })
                        }
                        className="rounded w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />
                      Allow Overtime
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-500">
                        AFTER
                      </span>
                      <input
                        type="number"
                        min="0"
                        disabled={!form.overtimeEnabled}
                        value={form.overtimeAfterMinutes}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            overtimeAfterMinutes: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-400 disabled:opacity-50 disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <div className="pt-6 border-t border-slate-100 flex gap-3 pb-8">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createShift.isPending || updateShift.isPending}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {createShift.isPending || updateShift.isPending ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : editingPolicyId ? (
                    "Update Policy"
                  ) : (
                    "Save Policy"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
