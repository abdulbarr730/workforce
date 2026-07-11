"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X, Edit2, Trash2 } from "lucide-react";

interface ProductivityRule {
  _id: string;
  scopeType: "GLOBAL" | "DEPARTMENT" | "EMPLOYEE";
  scopeId?: string | null;
  appName: string;
  titlePattern?: string | null;
  productivityCategory: "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
  productivityScore: number;
  allowanceMinutes: number;
}

const CATEGORIES = ["PRODUCTIVE", "UNPRODUCTIVE", "NEUTRAL"];
const SCOPES = ["GLOBAL", "DEPARTMENT", "EMPLOYEE"];
const CATEGORY_COLORS: Record<string, string> = {
  PRODUCTIVE: "bg-green-50 text-green-700",
  UNPRODUCTIVE: "bg-red-50 text-red-700",
  NEUTRAL: "bg-gray-100 text-gray-600",
};

const DEFAULT_FORM: Omit<ProductivityRule, "_id"> = {
  scopeType: "GLOBAL",
  scopeId: "",
  appName: "",
  titlePattern: "",
  productivityCategory: "PRODUCTIVE",
  productivityScore: 1.0,
  allowanceMinutes: 30,
};

export default function ProductivityRulesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["productivity-rules"],
    queryFn: () => api.get("/api/productivity-rules").then((r) => r.data.data),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/api/departments").then((r) => r.data.data),
  });

  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.get("/api/users?role=EMPLOYEE").then((r) => r.data.data),
  });

  const createRule = useMutation({
    mutationFn: (payload: any) => api.post("/api/productivity-rules", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productivity-rules"] });
      closeForm();
    },
  });

  const updateRule = useMutation({
    mutationFn: (payload: any) =>
      api.put(`/api/productivity-rules/${editingId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productivity-rules"] });
      closeForm();
    },
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => api.delete(`/api/productivity-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productivity-rules"] }),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      scopeId: form.scopeType === "GLOBAL" ? null : form.scopeId || null,
    };
    if (editingId) updateRule.mutate(payload);
    else createRule.mutate(payload);
  };

  const openEdit = (rule: ProductivityRule) => {
    setForm({
      scopeType: rule.scopeType,
      scopeId: rule.scopeId || "",
      appName: rule.appName,
      titlePattern: rule.titlePattern || "",
      productivityCategory: rule.productivityCategory,
      productivityScore: rule.productivityScore,
      allowanceMinutes: rule.allowanceMinutes ?? 30,
    });
    setEditingId(rule._id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
  };

  const ruleList: ProductivityRule[] = rules ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Productivity Rules
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Classify apps and patterns with specific scopes and scores.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Rule
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {[
                    "App / Pattern",
                    "Scope",
                    "Category",
                    "Score",
                    "Allowance",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-gray-500 px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ruleList.map((rule) => (
                  <tr
                    key={rule._id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {rule.appName}
                      </p>
                      {rule.titlePattern && (
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          {rule.titlePattern}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-700">
                        {rule.scopeType}
                      </p>
                      {rule.scopeType !== "GLOBAL" && (
                        <p className="text-xs text-gray-400">{rule.scopeId}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[rule.productivityCategory] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {rule.productivityCategory}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900 font-medium">
                        {(rule.productivityScore * 100).toFixed(0)}%
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {rule.productivityCategory === "UNPRODUCTIVE" ? (
                        <p className="text-sm text-gray-900 font-medium">
                          {rule.allowanceMinutes ?? 30} mins
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 font-medium">-</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(rule)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            confirm("Delete this rule?") &&
                            deleteRule.mutate(rule._id)
                          }
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {ruleList.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-gray-400"
                    >
                      No rules configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 my-8">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? "Edit Rule" : "Add Rule"}
              </h2>
              <button
                onClick={closeForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Scope Type
                  </label>
                  <select
                    value={form.scopeType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        scopeType: e.target.value as any,
                        scopeId: "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {SCOPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                {form.scopeType === "DEPARTMENT" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Department
                    </label>
                    <select
                      required
                      value={form.scopeId || ""}
                      onChange={(e) =>
                        setForm({ ...form, scopeId: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="" disabled>
                        Select Dept...
                      </option>
                      {(Array.isArray(departments)
                        ? departments
                        : departments?.departments || []
                      ).map((d: any) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {form.scopeType === "EMPLOYEE" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Employee
                    </label>
                    <select
                      required
                      value={form.scopeId || ""}
                      onChange={(e) =>
                        setForm({ ...form, scopeId: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="" disabled>
                        Select Emp...
                      </option>
                      {(Array.isArray(employees)
                        ? employees
                        : employees?.users || []
                      ).map((emp: any) => (
                        <option key={emp.employeeId} value={emp.employeeId}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  App Name
                </label>
                <input
                  type="text"
                  required
                  value={form.appName}
                  onChange={(e) =>
                    setForm({ ...form, appName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="e.g. Chrome, VS Code"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Title / URL Pattern (Regex/Substring)
                </label>
                <input
                  type="text"
                  value={form.titlePattern || ""}
                  onChange={(e) =>
                    setForm({ ...form, titlePattern: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="e.g. youtube\.com, Google Sheets"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={form.productivityCategory}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        productivityCategory: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Productivity Score (0 to 1)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    required
                    value={form.productivityScore}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        productivityScore: parseFloat(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              {form.productivityCategory === "UNPRODUCTIVE" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Daily Allowance (Minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.allowanceMinutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        allowanceMinutes: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If the user spends more than this amount of time, they will
                    be flagged in Needs Attention.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createRule.isPending || updateRule.isPending}
                  className="flex-1 py-2 bg-gray-900 text-white font-medium rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {editingId ? "Save Changes" : "Add Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
