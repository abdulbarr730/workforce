"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, Search, X, Pencil, Trash2 } from "lucide-react";

interface User {
  _id: string;
  employeeId: string;
  name: string;
  email: string;
  role: string;
  departmentId?: string;
  departmentName?: string;
  assignedShiftPolicyId?: string;
  assignedShiftPolicyName?: string;
  isActive: boolean;
}

const ROLES = ["EMPLOYEE", "MANAGER", "HR", "ADMIN"];

export default function EmployeesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ _id: "", name: "", email: "", password: "", employeeId: "", role: "EMPLOYEE", departmentId: "", departmentName: "", assignedShiftPolicyId: "" });
  const [formError, setFormError] = useState("");
  const isEditing = !!form._id;

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/api/departments").then((r) => r.data.data),
  });

  const { data: shiftPolicies } = useQuery({
    queryKey: ["shiftPolicies"],
    queryFn: () => api.get("/api/attendance/shifts").then((r) => r.data.data),
  });

  const createUser = useMutation({
    mutationFn: (payload: typeof form) => {
      const { _id, ...data } = payload;
      if (isEditing) {
        if (!data.password) delete (data as any).password;
        return api.put(`/api/users/${_id}`, data);
      }
      return api.post("/api/users", data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setForm({ _id: "", name: "", email: "", password: "", employeeId: "", role: "EMPLOYEE", departmentId: "", departmentName: "", assignedShiftPolicyId: "" });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setFormError(msg || (isEditing ? "Failed to update employee" : "Failed to create employee"));
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const users: User[] = Array.isArray(data) ? data : (data?.users ?? []);
  const filtered = users.filter(
    (u) =>
      u.role !== "SUPER_ADMIN" &&
      u.role !== "ADMIN" &&
      (roleFilter === "All" || u.role === roleFilter) &&
      (u.name.toLowerCase().includes(search.toLowerCase()) ||
       u.employeeId.toLowerCase().includes(search.toLowerCase()) ||
       u.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-1">{users.filter(u => u.role !== "SUPER_ADMIN" && u.role !== "ADMIN").length} total employees</p>
        </div>
        <button
          onClick={() => {
            setForm({ _id: "", name: "", email: "", password: "", employeeId: "", role: "EMPLOYEE", departmentId: "", departmentName: "", assignedShiftPolicyId: "" });
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm rounded-lg transition-colors"
          style={{ backgroundColor: "#FF9900" }}
        >
          <Plus className="w-4 h-4" /> Add Employee
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID or email..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="All">All Roles</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="HR">HR</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 w-16">Sr. No</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Employee</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">ID</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Department</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, index) => (
                  <tr key={user._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.employeeId}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">{user.role}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.departmentName || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setForm({ _id: user._id, name: user.name, email: user.email, password: "", employeeId: user.employeeId, role: user.role, departmentId: user.departmentId || "", departmentName: user.departmentName || "", assignedShiftPolicyId: user.assignedShiftPolicyId || "" });
                          setShowForm(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Edit"
                      ><Pencil className="w-4 h-4" /></button>
                      <button
                        onClick={() => {
                          if (window.confirm("Are you sure you want to delete this employee?")) {
                            deleteUser.mutate(user._id);
                          }
                        }}
                        disabled={deleteUser.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors ml-1"
                        title="Delete"
                      ><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No employees found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">{isEditing ? "Edit Employee" : "Add Employee"}</h2>
              <button onClick={() => { setShowForm(false); setFormError(""); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); setFormError(""); createUser.mutate(form); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => {
                    const sel = (departments?.departments ?? []).find((d: any) => d._id === e.target.value);
                    setForm({ ...form, departmentId: e.target.value, departmentName: sel?.name || "" });
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  required
                >
                  <option value="">Select department</option>
                  {(departments?.departments ?? []).map((d: { _id: string; name: string }) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>
              {[
                { key: "name", label: "Full Name", type: "text" },
                { key: "email", label: "Email", type: "email" },
                { key: "password", label: "Password", type: "password" },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type={type}
                    required={type !== "password" || !isEditing}
                    value={form[key as keyof typeof form]}
                    placeholder={type === "password" && isEditing ? "Leave blank to keep same" : ""}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Shift Policy</label>
                <select
                  value={form.assignedShiftPolicyId}
                  onChange={(e) => setForm({ ...form, assignedShiftPolicyId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Default / None</option>
                  {(shiftPolicies ?? []).map((s: { _id: string; name: string }) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              </div>
              {formError && <p className="text-xs text-red-600">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setFormError(""); }} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createUser.isPending} className="flex-1 py-2 text-white rounded-lg text-sm disabled:opacity-50" style={{ backgroundColor: "#232F3E" }}>
                  {createUser.isPending ? "Saving..." : (isEditing ? "Save Changes" : "Create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
