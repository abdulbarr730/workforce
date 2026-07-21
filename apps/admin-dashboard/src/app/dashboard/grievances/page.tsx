"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { X, MessageSquareWarning, CheckCircle } from "lucide-react";

interface Grievance {
  _id: string;
  employeeId: string;
  title: string;
  description: string;
  status: "PENDING" | "RESOLVED";
  createdAt: string;
  resolutionNote?: string;
}

export default function AdminGrievancesPage() {
  const qc = useQueryClient();
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: grievances, isLoading } = useQuery({
    queryKey: ["all-grievances"],
    queryFn: () =>
      api.get("/api/grievances/all").then((r) => r.data.data),
  });

  const resolveGrievance = useMutation({
    mutationFn: (payload: { id: string; resolutionNote: string }) =>
      api.put(`/api/grievances/${payload.id}/resolve`, { resolutionNote: payload.resolutionNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-grievances"] });
      setSelectedGrievance(null);
      setResolutionNote("");
    },
  });

  const grievanceList: Grievance[] = grievances ?? [];

  const getUserName = (empId: string) => {
    if (!users) return empId;
    const allUsers = Array.isArray(users) ? users : (users.users ?? []);
    const u = allUsers.find((user: any) => user.employeeId === empId);
    return u ? `${u.name} (${u.employeeId})` : empId;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <MessageSquareWarning className="w-7 h-7 text-indigo-600" />
          Workplace Grievances
        </h1>
        <p className="text-sm text-gray-500 mt-1 font-medium">
          View and resolve employee grievances across the organization.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm font-medium text-gray-400">
            Loading grievances...
          </div>
        ) : grievanceList.length === 0 ? (
          <div className="p-16 text-center">
            <MessageSquareWarning className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-sm font-bold text-gray-400">
              No grievances found.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-bold text-gray-500 px-6 py-4 uppercase tracking-wider">Date</th>
                  <th className="text-left text-xs font-bold text-gray-500 px-6 py-4 uppercase tracking-wider">Employee</th>
                  <th className="text-left text-xs font-bold text-gray-500 px-6 py-4 uppercase tracking-wider">Title / Details</th>
                  <th className="text-left text-xs font-bold text-gray-500 px-6 py-4 uppercase tracking-wider">Status</th>
                  <th className="text-left text-xs font-bold text-gray-500 px-6 py-4 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grievanceList.map((g) => (
                  <tr key={g._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {formatDate(g.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">
                      {getUserName(g.employeeId)}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-gray-900">{g.title}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2 max-w-sm">{g.description}</p>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          g.status === "RESOLVED"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {g.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {g.status === "PENDING" && (
                        <button
                          onClick={() => setSelectedGrievance(g)}
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                          Resolve
                        </button>
                      )}
                      {g.status === "RESOLVED" && (
                        <span className="text-xs text-gray-400 font-medium">
                          Resolved
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedGrievance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">Resolve Grievance</h2>
              <button
                onClick={() => {
                  setSelectedGrievance(null);
                  setResolutionNote("");
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Employee</p>
                <p className="text-sm font-semibold text-gray-900">{getUserName(selectedGrievance.employeeId)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Issue</p>
                <p className="text-sm font-semibold text-gray-900">{selectedGrievance.title}</p>
                <div className="mt-2 p-3 bg-gray-50 rounded-xl text-sm text-gray-700 border border-gray-100">
                  {selectedGrievance.description}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4">
                  Resolution Note (Optional)
                </label>
                <textarea
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all resize-none"
                  placeholder="Note to employee regarding the resolution..."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedGrievance(null);
                  setResolutionNote("");
                }}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => resolveGrievance.mutate({ id: selectedGrievance._id, resolutionNote })}
                disabled={resolveGrievance.isPending}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-green-700 transition-all disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {resolveGrievance.isPending ? "Resolving..." : "Mark as Resolved"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
