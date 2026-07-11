"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Check, X } from "lucide-react";

interface LeaveRequest {
  _id: string;
  employeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
};

export default function LeavesPage() {
  const qc = useQueryClient();

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

  const leaveList: LeaveRequest[] = leaves ?? [];
  const pending = leaveList.filter((l) => l.status === "PENDING");
  const processed = leaveList.filter((l) => l.status !== "PENDING");

  function LeaveTable({
    items,
    showActions,
  }: {
    items: LeaveRequest[];
    showActions: boolean;
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
                ...(showActions ? ["Actions"] : []),
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
                {showActions && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
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
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={showActions ? 7 : 6}
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
            <LeaveTable items={pending} showActions={true} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                Processed ({processed.length})
              </h2>
            </div>
            <LeaveTable items={processed} showActions={false} />
          </div>
        </>
      )}
    </div>
  );
}
