"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Plus, X, Calendar } from "lucide-react";

interface Holiday {
  _id: string;
  name: string;
  date: string;
  type: string;
  paid: boolean;
}

const HOLIDAY_TYPES = ["NATIONAL", "COMPANY", "DEPARTMENT", "EMERGENCY"];

export default function HolidaysPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    date: "",
    type: "NATIONAL",
    paid: true,
  });

  const { data: holidays, isLoading } = useQuery({
    queryKey: ["holidays"],
    queryFn: () =>
      api.get("/api/attendance/time-off/holidays").then((r) => r.data.data),
  });

  const createHoliday = useMutation({
    mutationFn: (payload: typeof form) =>
      api.post("/api/attendance/time-off/holidays", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      setShowForm(false);
      setForm({ name: "", date: "", type: "NATIONAL", paid: true });
    },
  });

  const holidayList: Holiday[] = holidays ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Holidays</h1>
          <p className="text-sm text-gray-500 mt-1">
            {holidayList.length} holidays configured
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Holiday
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {holidayList.length === 0 ? (
            <div className="p-12 flex flex-col items-center text-center">
              <Calendar className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-sm text-gray-400">No holidays added yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Name", "Date", "Type", "Paid"].map((h) => (
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
                  {holidayList
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((h) => (
                      <tr
                        key={h._id}
                        className="border-b border-gray-50 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {h.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(h.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                            {h.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.paid ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}
                          >
                            {h.paid ? "Paid" : "Unpaid"}
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
                Add Holiday
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createHoliday.mutate(form);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Holiday Name
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="e.g. Republic Day"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {HOLIDAY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.paid}
                  onChange={(e) => setForm({ ...form, paid: e.target.checked })}
                  className="rounded"
                />
                Paid holiday
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createHoliday.isPending}
                  className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {createHoliday.isPending ? "Adding..." : "Add Holiday"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
