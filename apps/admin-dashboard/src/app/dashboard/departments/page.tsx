"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X, Building2, Pencil, Trash2, Users } from "lucide-react";

interface Department {
  _id: string;
  name: string;
  managerId?: string;
  managerName?: string;
  parentDepartment?: string;
  code?: string;
}

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    _id: "",
    name: "",
    managerId: "",
    managerName: "",
    parentDepartment: "",
    code: "",
  });
  const isEditing = !!form._id;
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);

  const { data: departments, isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/api/departments").then((r) => r.data.data),
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const createDept = useMutation({
    mutationFn: (payload: Omit<typeof form, "_id">) =>
      api.post("/api/departments", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setShowForm(false);
      setForm({
        _id: "",
        name: "",
        managerId: "",
        managerName: "",
        parentDepartment: "",
        code: "",
      });
    },
  });

  const updateDept = useMutation({
    mutationFn: (payload: typeof form) => {
      const { _id, ...data } = payload;
      return api.put(`/api/departments/${_id}`, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setShowForm(false);
      setForm({
        _id: "",
        name: "",
        managerId: "",
        managerName: "",
        parentDepartment: "",
        code: "",
      });
    },
  });

  const deleteDept = useMutation({
    mutationFn: (id: string) => api.delete(`/api/departments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });

  const deptList: Department[] = Array.isArray(departments)
    ? departments
    : (departments?.departments ?? []);
  const rawUsers = Array.isArray(users) ? users : (users?.users ?? []);
  const managers = rawUsers.filter(
    (u: any) => u.role !== "SUPER_ADMIN" && u.role !== "ADMIN",
  );

  const deptUsers = selectedDept
    ? rawUsers.filter((u: any) => u.departmentName === selectedDept.name)
    : [];

  useEffect(() => {
    if (!isEditing && showForm) {
      const existingCodes = deptList
        .map((d) => parseInt(d.code || "0", 10))
        .filter((n) => !isNaN(n));
      const nextCodeNumber =
        existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
      const nextCode = nextCodeNumber.toString().padStart(2, "0");
      setForm((prev) =>
        prev.code === nextCode ? prev : { ...prev, code: nextCode },
      );
    }
  }, [showForm, isEditing, deptList]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Departments
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {deptList.length} total departments
          </p>
        </div>
        <button
          onClick={() => {
            setForm({
              _id: "",
              name: "",
              managerId: "",
              managerName: "",
              parentDepartment: "",
              code: "",
            });
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200"
        >
          <Plus className="w-4 h-4" /> Add Department
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {deptList.map((dept) => {
            const count = rawUsers.filter(
              (u: any) => u.departmentName === dept.name,
            ).length;
            return (
              <div
                key={dept._id}
                className="bg-white rounded-2xl border border-gray-100 p-6 relative group hover:border-indigo-100 hover:shadow-lg transition-all duration-300 cursor-pointer"
                onClick={() => setSelectedDept(dept)}
              >
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({
                        _id: dept._id,
                        name: dept.name,
                        managerId: dept.managerId || "",
                        managerName: dept.managerName || "",
                        parentDepartment: dept.parentDepartment || "",
                        code: dept.code || "",
                      });
                      setShowForm(true);
                    }}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors bg-white rounded-md shadow-sm border border-gray-100"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          "Are you sure you want to delete this department?",
                        )
                      ) {
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

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center shrink-0 border border-indigo-100/50">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="pr-12 flex-1">
                    <h3 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                      {dept.name}{" "}
                      <span className="text-gray-400 font-normal">
                        ({dept.code || "—"})
                      </span>
                    </h3>
                    {dept.managerName ? (
                      <p className="text-xs font-medium text-gray-500 mt-1">
                        Manager:{" "}
                        <span className="text-gray-700">
                          {dept.managerName}
                        </span>
                      </p>
                    ) : dept.managerId ? (
                      <p className="text-xs font-medium text-gray-500 mt-1">
                        Manager:{" "}
                        <span className="text-gray-700">{dept.managerId}</span>
                      </p>
                    ) : null}
                    {dept.parentDepartment && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Under: {dept.parentDepartment}
                      </p>
                    )}

                    <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5 w-fit border border-gray-100">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span>
                        {count} Employee{count !== 1 && "s"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {deptList.length === 0 && (
            <div className="col-span-full p-12 flex flex-col items-center justify-center text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                <Building2 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                No departments yet
              </h3>
              <p className="text-sm text-gray-500">
                Get started by creating your first department.
              </p>
            </div>
          )}
        </div>
      )}

      {selectedDept && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedDept.name}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {deptUsers.length} Employee{deptUsers.length !== 1 && "s"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDept(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {deptUsers.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p>No employees in this department yet.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {deptUsers.map((u: any) => (
                    <div
                      key={u._id}
                      className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm border border-indigo-100">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {u.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {u.employeeId} • {u.role}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                        Active
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {isEditing ? "Edit Department" : "New Department"}
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
                if (isEditing) updateDept.mutate(form);
                else createDept.mutate(form);
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Department Name
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="e.g. Engineering"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Department Code
                </label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="e.g. 01"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Manager
                </label>
                <select
                  value={form.managerId}
                  onChange={(e) => {
                    const sel = managers.find(
                      (m: any) => m.employeeId === e.target.value,
                    );
                    setForm({
                      ...form,
                      managerId: e.target.value,
                      managerName: sel?.name || "",
                    });
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                >
                  <option value="">Select manager (optional)</option>
                  {managers.map(
                    (m: { _id: string; name: string; employeeId: string }) => (
                      <option key={m._id} value={m.employeeId}>
                        {m.name} ({m.employeeId})
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Parent Department
                </label>
                <select
                  value={form.parentDepartment}
                  onChange={(e) =>
                    setForm({ ...form, parentDepartment: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                >
                  <option value="">None</option>
                  {deptList
                    .filter((d) => d._id !== form._id)
                    .map((d) => (
                      <option key={d._id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDept.isPending || updateDept.isPending}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {createDept.isPending || updateDept.isPending
                    ? "Saving..."
                    : isEditing
                      ? "Save Changes"
                      : "Create Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
