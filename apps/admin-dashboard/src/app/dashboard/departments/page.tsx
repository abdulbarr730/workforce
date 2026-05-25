"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X, Building2 } from "lucide-react";

interface Department {
  _id: string;
  name: string;
  managerId?: string;
  parentDepartment?: string;
}

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", managerId: "", parentDepartment: "" });

  const { data: departments, isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/api/departments").then((r) => r.data.data),
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const createDept = useMutation({
    mutationFn: (payload: typeof form) => api.post("/api/departments", payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); setShowForm(false); setForm({ name: "", managerId: "", parentDepartment: "" }); },
  });

  const deptList: Department[] = departments?.departments ?? [];
  const managers = (users?.users ?? []).filter((u: { role: string }) => ["MANAGER", "ADMIN", "HR"].includes(u.role));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500 mt-1">{deptList.length} departments</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Department
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {deptList.map((dept) => (
            <div key={dept._id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-gray-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{dept.name}</h3>
                  {dept.managerId && <p className="text-xs text-gray-500 mt-0.5">Manager: {dept.managerId}</p>}
                  {dept.parentDepartment && <p className="text-xs text-gray-400 mt-0.5">Under: {dept.parentDepartment}</p>}
                </div>
              </div>
            </div>
          ))}
          {deptList.length === 0 && (
            <div className="col-span-3 p-12 flex flex-col items-center text-center bg-white rounded-xl border border-gray-200">
              <Building2 className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-sm text-gray-400">No departments yet</p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Add Department</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createDept.mutate(form); }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Department Name</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Manager</label>
                <select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">Select manager (optional)</option>
                  {managers.map((m: { _id: string; name: string; employeeId: string }) => (
                    <option key={m._id} value={m.employeeId}>{m.name} ({m.employeeId})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Parent Department</label>
                <select value={form.parentDepartment} onChange={(e) => setForm({ ...form, parentDepartment: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">None</option>
                  {deptList.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createDept.isPending} className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50">
                  {createDept.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
