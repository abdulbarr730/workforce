"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, History, Search } from "lucide-react";
import { api } from "@/lib/api";

type ShiftHistoryEntry = {
  id: string;
  policyName: string;
  changedAt: string;
  effectiveFrom: string;
  changedBy: string;
  changedByName?: string;
  changes: string[];
};

export default function ShiftPolicyHistoryPage() {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["shift-policy-history"],
    queryFn: () =>
      api.get("/api/attendance/shifts/history").then((r) => r.data.data || []),
  });

  const entries: ShiftHistoryEntry[] = data || [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) =>
      [
        entry.policyName,
        entry.changedBy,
        entry.changedByName,
        entry.effectiveFrom,
        ...(entry.changes || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [entries, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/dashboard/shifts"
            className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600"
          >
            <ArrowLeft size={16} /> Back to shifts
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900">
            <span className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
              <History size={22} />
            </span>
            Shift policy update history
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Search who changed timings, cutoffs, breaks, required hours, or
            effective dates.
          </p>
        </div>
        <div className="relative w-full sm:w-96">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search policy, admin, date, field..."
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4 text-sm font-bold text-slate-700">
          {filtered.length} update{filtered.length === 1 ? "" : "s"} found
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-sm font-medium text-slate-500">
            Loading policy history...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm font-medium text-slate-500">
            No policy history found.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((entry) => (
              <div key={entry.id} className="p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-base font-black text-slate-900">
                      {entry.policyName}
                    </div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                      Effective from {entry.effectiveFrom}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-sm font-bold text-slate-700">
                      {entry.changedByName || entry.changedBy}
                    </div>
                    <div className="text-xs font-medium text-slate-400">
                      {new Date(entry.changedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                    Changes
                  </div>
                  <ul className="space-y-1 text-sm font-medium text-slate-700">
                    {(entry.changes || []).map((change, index) => (
                      <li key={`${entry.id}-${index}`}>{change}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
