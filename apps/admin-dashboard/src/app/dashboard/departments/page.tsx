"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X, Building2, Pencil, Trash2 } from "lucide-react";

interface Department {
  _id: string;
  name: string;
  managerId?: string;
  managerName?: string;
  parentDepartment?: string;
}

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ _id: "", name: "", managerId: "", managerName: "", parentDepartment: "" });
  const isEditing = !!form._id;

  const { data: departments, isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/api/departments").then((r) => r.data.data),
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const createDept = useMutation({
    mutationFn: (payload: Omit<typeof form, '_id'>) => api.post("/api/departments", payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); setShowForm(false); setForm({ _id: "", name: "", managerId: "", managerName: "", parentDepartment: "" }); },
  });

  const updateDept = useMutation({
    mutationFn: (payload: typeof form) => {
      const { _id, ...data } = payload;
      return api.put(`/api/departments/${_id}`, data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); setShowForm(false); setForm({ _id: "", name: "", managerId: "", managerName: "", parentDepartment: "" }); },
  });

  const deleteDept = useMutation({
    mutationFn: (id: string) => api.delete(`/api/departments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });

  const deptList: Department[] = Array.isArray(departments) ? departments : (departments?.departments ?? []);
  const rawUsers = Array.isArray(users) ? users : (users?.users ?? []);
  const managers = rawUsers.filter((u: any) => u.role !== "SUPER_ADMIN" && u.role !== "ADMIN");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500 mt-1">{deptList.length} departments</p>
        </div>
        <button
          onClick={() => {
            setForm({ _id: "", name: "", managerId: "", managerName: "", parentDepartment: "" });
            setShowForm(true);
          }}
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
            <div key={dept._id} className="bg-white rounded-xl border border-gray-200 p-5 relative group">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  onClick={() => {
                    setForm({ _id: dept._id, name: dept.name, managerId: dept.managerId || "", managerName: dept.managerName || "", parentDepartment: dept.parentDepartment || "" });
                    setShowForm(true);
                  }}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors bg-white rounded-md shadow-sm border border-gray-100"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to delete this department?")) {
                      deleteDept.mutate(dept._id);
                    }
                  }}
                  disabled={deleteDept.isPending}
                  className="p-1.5 text-gray-400 hover:text-red-600 transition-colors bg-white rounded-md shadow-sm border border-gray-100"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-gray-600" />
                </div>
                <div className="pr-12">
                  <h3 className="text-sm font-semibold text-gray-900">{dept.name}</h3>
                  {dept.managerName ? (
                    <p className="text-xs text-gray-500 mt-0.5">Manager: {dept.managerName}</p>
                  ) : dept.managerId ? (
                    <p className="text-xs text-gray-500 mt-0.5">Manager: {dept.managerId}</p>
                  ) : null}
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
              <h2 className="text-base font-semibold text-gray-900">{isEditing ? "Edit Department" : "Add Department"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { 
              e.preventDefault(); 
              if (isEditing) updateDept.mutate(form);
              else createDept.mutate(form); 
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Department Name</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Manager</label>
                <select value={form.managerId} onChange={(e) => {
                  const sel = managers.find((m: any) => m.employeeId === e.target.value);
                  setForm({ ...form, managerId: e.target.value, managerName: sel?.name || "" });
                }}
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
                  {deptList.filter(d => d._id !== form._id).map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createDept.isPending || updateDept.isPending} className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50">
                  {createDept.isPending || updateDept.isPending ? "Saving..." : (isEditing ? "Save Changes" : "Create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
