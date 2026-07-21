"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { formatDate } from "@/lib/utils";
import { Plus, X, MessageSquareWarning } from "lucide-react";

interface Grievance {
  _id: string;
  title: string;
  description: string;
  status: "PENDING" | "RESOLVED";
  createdAt: string;
  resolutionNote?: string;
}

export default function MyGrievancesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
  });

  const { data: grievances, isLoading } = useQuery({
    queryKey: ["my-grievances", user?.employeeId],
    queryFn: () =>
      api.get("/api/grievances/mine").then((r) => r.data.data),
    enabled: !!user,
  });

  const submitGrievance = useMutation({
    mutationFn: (payload: typeof form) =>
      api.post("/api/grievances/request", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-grievances"] });
      setShowForm(false);
      setForm({ title: "", description: "" });
    },
  });

  const grievanceList: Grievance[] = grievances ?? [];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquareWarning className="w-6 h-6 text-indigo-500" />
            My Grievances
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Submit and track your workplace grievances.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium text-sm rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Submit Grievance
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm font-medium text-gray-400">
            Loading your grievances...
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
                  <th className="text-left text-xs font-bold text-gray-500 px-6 py-4 uppercase tracking-wider">Title</th>
                  <th className="text-left text-xs font-bold text-gray-500 px-6 py-4 uppercase tracking-wider">Status</th>
                  <th className="text-left text-xs font-bold text-gray-500 px-6 py-4 uppercase tracking-wider">Resolution Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grievanceList.map((g) => (
                  <tr key={g._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {formatDate(g.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-gray-900">{g.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{g.description}</p>
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
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {g.resolutionNote || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">Submit Grievance</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Title
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="E.g. Pay discrepancy"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Description
                </label>
                <textarea
                  required
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                  placeholder="Please provide details..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => submitGrievance.mutate(form)}
                disabled={submitGrievance.isPending || !form.title || !form.description}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {submitGrievance.isPending ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
