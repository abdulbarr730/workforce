"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CalendarCheck, Download, CheckCircle2, Clock, XCircle, Check, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

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

  const exportToCSV = () => {
    if (!leaves || leaves.length === 0) return;

    // Define headers
    const headers = ["Employee ID", "Employee Name", "Type", "Start Date", "End Date", "Status", "Reason"];
    
    // Convert data to CSV rows
    const rows = leaves.map((l: any) => [
      l.employeeId,
      l.employeeName || l.employeeId,
      l.type,
      l.startDate.split("T")[0],
      l.endDate.split("T")[0],
      l.status,
      `"${(l.reason || "").replace(/"/g, '""')}"` // Escape quotes and wrap in quotes for CSV
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(","),
      ...rows.map((r: any) => r.join(","))
    ].join("\n");

    // Create a Blob and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `leave_requests_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-6 shadow-sm ${compact ? "h-full flex flex-col" : "mb-6"}`}>
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
        
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-semibold transition-colors"
        >
          <Download className="w-4 h-4" />
          Export to Excel
        </button>
      </div>

      <div className={`overflow-x-auto overflow-y-auto ${compact ? "flex-1 min-h-[200px]" : ""}`}>
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
