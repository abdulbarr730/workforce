"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CalendarCheck, CheckCircle2, Clock, XCircle, Check, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export function LeaveRequestsTable({ compact }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { data: leaves, isLoading } = useQuery({
    queryKey: ["all-leaves"],
    queryFn: () => api.get("/api/attendance/time-off/leaves").then((r) => r.data.data),
  });

  const processLeave = useMutation({
    mutationFn: ({ leaveId, status, adminReason }: { leaveId: string; status: string; adminReason?: string }) =>
      api.patch(`/api/attendance/time-off/leaves/${leaveId}/process`, {
        status,
        adminReason
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-leaves"] }),
  });



  const pendingLeaves = leaves?.filter((l: any) => l.status === "PENDING") || [];
  const approvedLeaves = leaves?.filter((l: any) => l.status === "APPROVED") || [];
  
  const sortedPendingLeaves = [...pendingLeaves].sort((a, b) => {
    const dateA = new Date(a.startDate).getTime();
    const dateB = new Date(b.startDate).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });

  const getOverlapCount = (leave: any) => {
    const start = new Date(leave.startDate).getTime();
    const end = new Date(leave.endDate).getTime();
    return approvedLeaves.filter((al: any) => {
      const aStart = new Date(al.startDate).getTime();
      const aEnd = new Date(al.endDate).getTime();
      return start <= aEnd && end >= aStart;
    }).length;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm animate-pulse h-64 mb-6">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 bg-gray-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!leaves || leaves.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <Link href="/dashboard/leaves" className="block h-full">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm h-full flex flex-col cursor-pointer hover:border-indigo-200 transition-colors group">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">Pending Leaves</h2>
                <p className="text-xs text-gray-500 mt-1">Leave requests requiring review</p>
              </div>
            </div>
            <div className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {sortedPendingLeaves.length}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="space-y-3">
              {sortedPendingLeaves.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">
                  No pending leave requests
                </div>
              ) : (
                sortedPendingLeaves.map((leave: any) => {
                  const overlap = getOverlapCount(leave);
                  return (
                    <div key={leave._id} className="flex justify-between items-center bg-gray-50 p-3.5 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{leave.employeeName || leave.employeeId}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDate(leave.startDate.split("T")[0])}
                          {leave.startDate !== leave.endDate && ` to ${formatDate(leave.endDate.split("T")[0])}`}
                        </p>
                      </div>
                      {overlap > 0 && (
                        <div className="flex flex-col items-end" title={`${overlap} approved members off during these dates`}>
                          <span className="text-[10px] uppercase font-bold text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {overlap} {overlap === 1 ? 'member' : 'members'} off
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Leave Requests</h2>
            <p className="text-xs text-gray-500 mt-1">Overview of employee leave requests.</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Dates</th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leaves.slice(0, 10).map((leave: any) => (
              <tr key={leave._id} className="hover:bg-gray-50/50 transition-colors">
                <td className="py-3 px-4">
                  <div className="font-medium text-gray-900">{leave.employeeName || leave.employeeId}</div>
                  <div className="text-xs text-gray-500">{leave.employeeId}</div>
                </td>
                <td className="py-3 px-4 text-sm text-gray-700">{leave.type.replace(/_/g, " ")}</td>
                <td className="py-3 px-4 text-sm text-gray-600">
                  {formatDate(leave.startDate.split("T")[0])}
                  {leave.startDate !== leave.endDate && ` to ${formatDate(leave.endDate.split("T")[0])}`}
                </td>
                <td className="py-3 px-4">
                  {leave.status === "APPROVED" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  )}
                  {leave.status === "PENDING" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-yellow-50 text-yellow-700">
                      <Clock className="w-3.5 h-3.5" /> Pending
                    </span>
                  )}
                  {leave.status === "REJECTED" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700">
                      <XCircle className="w-3.5 h-3.5" /> Rejected
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  {leave.status === "PENDING" && (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          const adminReason = window.prompt("Reason for approval (Optional):");
                          processLeave.mutate({
                            leaveId: leave._id,
                            status: "APPROVED",
                            adminReason: adminReason || undefined,
                          });
                        }}
                        disabled={processLeave.isPending}
                        className="p-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                        title="Approve"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const adminReason = window.prompt("Reason for rejection (Optional):");
                          processLeave.mutate({
                            leaveId: leave._id,
                            status: "REJECTED",
                            adminReason: adminReason || undefined,
                          });
                        }}
                        disabled={processLeave.isPending}
                        className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                        title="Reject"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {leaves.length > 10 && (
          <div className="mt-4 text-center">
            <a href="/dashboard/leaves" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
              View all {leaves.length} requests &rarr;
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
