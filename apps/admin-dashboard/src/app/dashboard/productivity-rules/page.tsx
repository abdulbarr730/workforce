"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X } from "lucide-react";

interface ProductivityRule {
  _id: string;
  appName: string;
  domain?: string;
  defaultCategory: string;
}

const CATEGORIES = ["PRODUCTIVE", "UNPRODUCTIVE", "NEUTRAL"];
const CATEGORY_COLORS: Record<string, string> = {
  PRODUCTIVE: "bg-green-50 text-green-700",
  UNPRODUCTIVE: "bg-red-50 text-red-700",
  NEUTRAL: "bg-gray-100 text-gray-600",
};

export default function ProductivityRulesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ appName: "", domain: "", defaultCategory: "PRODUCTIVE" });

  const { data: rules, isLoading } = useQuery({
    queryKey: ["productivity-rules"],
    queryFn: () => api.get("/api/productivity-rules").then((r) => r.data.data),
  });

  const createRule = useMutation({
    mutationFn: (payload: typeof form) => api.post("/api/productivity-rules", payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["productivity-rules"] }); setShowForm(false); setForm({ appName: "", domain: "", defaultCategory: "PRODUCTIVE" }); },
  });

  const ruleList: ProductivityRule[] = rules ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Productivity Rules</h1>
          <p className="text-sm text-gray-500 mt-1">Classify apps and domains as productive or unproductive</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors">
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
                <tr className="border-b border-gray-100">
                  {["App / Domain", "Category"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ruleList.map((rule) => (
                  <tr key={rule._id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{rule.appName}</p>
                      {rule.domain && <p className="text-xs text-gray-400">{rule.domain}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[rule.defaultCategory] ?? "bg-gray-100 text-gray-600"}`}>
                        {rule.defaultCategory}
                      </span>
                    </td>
                  </tr>
                ))}
                {ruleList.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-8 text-center text-sm text-gray-400">No rules configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Add Rule</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createRule.mutate(form); }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">App Name</label>
                <input type="text" required value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="e.g. VS Code, Chrome" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Domain (optional)</label>
                <input type="text" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="e.g. github.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <select value={form.defaultCategory} onChange={(e) => setForm({ ...form, defaultCategory: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createRule.isPending} className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50">
                  {createRule.isPending ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
