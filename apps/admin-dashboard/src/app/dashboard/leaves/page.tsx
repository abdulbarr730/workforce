"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Check, X, Edit2, Trash2 } from "lucide-react";
import { useState } from "react";

interface LeaveRequest {
  _id: string;
  employeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
}

const LEAVE_TYPES = ["CASUAL", "SICK", "ANNUAL", "EMERGENCY", "UNPAID", "PAID LEAVE"];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
};

export default function LeavesPage() {
  const qc = useQueryClient();
  const [editingLeave, setEditingLeave] = useState<LeaveRequest | null>(null);
  const [form, setForm] = useState({
    type: "CASUAL",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const { data: leaves, isLoading } = useQuery({
    queryKey: ["leaves"],
    queryFn: () =>
      api.get("/api/attendance/time-off/leaves").then((r) => r.data.data),
  });

  const processLeave = useMutation({
    mutationFn: ({ leaveId, status }: { leaveId: string; status: string }) =>
      api.patch(`/api/attendance/time-off/leaves/${leaveId}/process`, {
        status,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaves"] }),
  });

  const updateLeave = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: typeof form }) =>
      api.put(`/api/attendance/time-off/leaves/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      setEditingLeave(null);
    },
  });

  const deleteLeave = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/attendance/time-off/leaves/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
    },
  });

  const handleEditClick = (leave: LeaveRequest) => {
    setEditingLeave(leave);
    setForm({
      type: leave.type,
      startDate: format(new Date(leave.startDate), "yyyy-MM-dd"),
      endDate: format(new Date(leave.endDate), "yyyy-MM-dd"),
      reason: leave.reason,
    });
  };

  const leaveList: LeaveRequest[] = leaves ?? [];
  const pending = leaveList.filter((l) => l.status === "PENDING");
  const processed = leaveList.filter((l) => l.status !== "PENDING");

  function LeaveTable({
    items,
    allowProcess,
  }: {
    items: LeaveRequest[];
    allowProcess: boolean;
  }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {[
                "Employee",
                "Type",
                "From",
                "To",
                "Reason",
                "Status",
                "Actions",
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
            {items.map((leave) => (
              <tr
                key={leave._id}
                className="border-b border-gray-50 hover:bg-gray-50"
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {leave.employeeId}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
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
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {allowProcess && (
                      <>
                        <button
                          onClick={() =>
                            processLeave.mutate({
                              leaveId: leave._id,
                              status: "APPROVED",
                            })
                          }
                          disabled={processLeave.isPending}
                          className="p-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                          title="Approve"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            processLeave.mutate({
                              leaveId: leave._id,
                              status: "REJECTED",
                            })
                          }
                          disabled={processLeave.isPending}
                          className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                          title="Reject"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleEditClick(leave)}
                      className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this leave request?")) {
                          deleteLeave.mutate(leave._id);
                        }
                      }}
                      disabled={deleteLeave.isPending}
                      className="p-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-gray-400"
                >
                  No records
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Leave Management
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {pending.length} pending approval
        </p>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                Pending Approval ({pending.length})
              </h2>
            </div>
            <LeaveTable items={pending} allowProcess={true} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                Processed ({processed.length})
              </h2>
            </div>
            <LeaveTable items={processed} allowProcess={false} />
          </div>

          {editingLeave && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-semibold text-gray-900">
                    Edit Leave Request
                  </h2>
                  <button
                    onClick={() => setEditingLeave(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateLeave.mutate({ id: editingLeave._id, payload: form });
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
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                        onChange={(e) =>
                          setForm({ ...form, startDate: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                        onChange={(e) =>
                          setForm({ ...form, endDate: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingLeave(null)}
                      className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateLeave.isPending}
                      className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {updateLeave.isPending ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
