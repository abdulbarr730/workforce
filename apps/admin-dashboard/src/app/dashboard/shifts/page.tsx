"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X } from "lucide-react";

interface ShiftPolicy {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  gracePeriodMinutes: number;
  lateShiftStart: string;
  lateShiftEnd: string;
  workingDays: string[];
  isDefault: boolean;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function ShiftsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    startTime: "10:00",
    endTime: "18:30",
    gracePeriodMinutes: 0,
    lateShiftStart: "10:30",
    lateShiftEnd: "19:00",
    workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
    isDefault: false,
  });

  const { data: shifts, isLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.get("/api/attendance/shifts").then((r) => r.data.data),
  });

  const createShift = useMutation({
    mutationFn: (payload: typeof form) => api.post("/api/attendance/shifts", payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shifts"] }); setShowForm(false); },
  });

  const shiftList: ShiftPolicy[] = shifts ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Shift Policies</h1>
          <p className="text-sm text-gray-500 mt-1">Configure working hour templates</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Shift
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shiftList.map((shift) => (
            <div key={shift._id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{shift.name}</h3>
                  {shift.isDefault && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium mt-1 inline-block">Default</span>
                  )}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Hours</span>
                  <span className="text-gray-900 font-medium">{shift.startTime} – {shift.endTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Late shift</span>
                  <span className="text-gray-900">{shift.lateShiftStart} – {shift.lateShiftEnd}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Grace period</span>
                  <span className="text-gray-900">{shift.gracePeriodMinutes} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Working days</span>
                  <div className="flex gap-1">
                    {DAYS.map((d) => (
                      <span key={d} className={`text-xs px-1 py-0.5 rounded font-medium ${(shift.workingDays ?? []).includes(d) ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400"}`}>{d}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {shiftList.length === 0 && (
            <div className="col-span-2 p-8 text-center text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
              No shift policies configured. Add one to get started.
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">New Shift Policy</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createShift.mutate(form); }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Policy Name</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "startTime", label: "Start Time" },
                  { key: "endTime", label: "End Time" },
                  { key: "lateShiftStart", label: "Late Start" },
                  { key: "lateShiftEnd", label: "Late End" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                    <input type="time" value={form[key as keyof typeof form] as string}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Grace Period (minutes)</label>
                <input type="number" min="0" value={form.gracePeriodMinutes}
                  onChange={(e) => setForm({ ...form, gracePeriodMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Working Days</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((d) => (
                    <button type="button" key={d}
                      onClick={() => setForm({ ...form, workingDays: form.workingDays.includes(d) ? form.workingDays.filter((x) => x !== d) : [...form.workingDays, d] })}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${form.workingDays.includes(d) ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >{d}</button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="rounded" />
                Set as default shift
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createShift.isPending} className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50">
                  {createShift.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
