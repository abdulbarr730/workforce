"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarX2,
  Plus,
  Save,
  SlidersHorizontal,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

type LeaveType = {
  code: string;
  name: string;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
  isPaid: boolean;
  isActive: boolean;
};

type LeavePolicy = {
  types: LeaveType[];
  totalMonthlyLimit: number | null;
  totalYearlyLimit: number | null;
};

type Usage = { paid: number; unpaid: number; pending: number; left: number | null };
type BalanceType = {
  code: string;
  name: string;
  isPaid: boolean;
  isActive: boolean;
  hasOverride: boolean;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
  month: Usage;
  year: Usage;
};
type Balance = {
  employeeId: string;
  name: string;
  month: string;
  year: string;
  total: {
    monthlyLimit: number | null;
    yearlyLimit: number | null;
    hasOverride: boolean;
    month: Usage;
    year: Usage;
  };
  types: BalanceType[];
};

type Block = {
  _id: string;
  startDate: string;
  endDate: string;
  scope: "ALL" | "EMPLOYEES";
  employeeIds: string[];
  reason: string;
  isActive: boolean;
  createdByName?: string | null;
  updatedByName?: string | null;
};

type Person = { employeeId: string; name: string; isActive?: boolean; role?: string };

const errorText = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.message || fallback;

const limitText = (value: number | null) => (value === null ? "∞" : String(value));
const toInput = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);
const fromInput = (value: string) => (value.trim() === "" ? null : Number(value));

const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const card = "rounded-xl border border-gray-200 bg-white";
const input =
  "rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900";

export function LeavePolicySection({ users }: { users: Person[] }) {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const say = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 7000);
  };
  const employees = useMemo(
    () =>
      users
        .filter((u) => u.isActive !== false && u.role !== "SUPER_ADMIN" && u.employeeId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  return (
    <div className="space-y-6">
      {notice ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}
        >
          {notice.text}
        </div>
      ) : null}
      <LeaveTypesCard say={say} />
      <BlockedDaysCard say={say} employees={employees} />
      <BalancesCard say={say} />
    </div>
  );
}


// ── Leave types ───────────────────────────────────────────────────────────
function LeaveTypesCard({ say }: { say: (ok: boolean, text: string) => void }) {
  const qc = useQueryClient();
  const { data: policy, isLoading } = useQuery<LeavePolicy>({
    queryKey: ["leave-policy"],
    queryFn: () => api.get("/api/attendance/time-off/leave-policy").then((r) => r.data.data),
  });
  const [draft, setDraft] = useState<LeaveType[]>([]);
  const [totalMonthly, setTotalMonthly] = useState("");
  const [totalYearly, setTotalYearly] = useState("");
  useEffect(() => {
    if (!policy) return;
    setDraft(policy.types);
    setTotalMonthly(toInput(policy.totalMonthlyLimit));
    setTotalYearly(toInput(policy.totalYearlyLimit));
  }, [policy]);

  const save = useMutation({
    mutationFn: () =>
      api.put("/api/attendance/time-off/leave-policy", {
        types: draft,
        totalMonthlyLimit: fromInput(totalMonthly),
        totalYearlyLimit: fromInput(totalYearly),
      }),
    onSuccess: () => {
      say(true, "Leave settings saved. Employees now see only these leave types.");
      qc.invalidateQueries({ queryKey: ["leave-policy"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
    },
    onError: (error) => say(false, errorText(error, "Could not save leave types.")),
  });

  const update = (index: number, patch: Partial<LeaveType>) =>
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index: number) => {
    const row = draft[index];
    if (
      !window.confirm(
        `Delete "${row.name || "this type"}"? Employees will no longer be able to request it. Requests already made with it are kept. Click "Save" to apply.`,
      )
    ) {
      return;
    }
    setDraft((rows) => rows.filter((_, i) => i !== index));
  };

  return (
    <section className={card}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Tags className="h-4 w-4" /> Leave types
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Only these types are shown to employees. Limits are in working days (blank =
            no limit). Leave taken beyond a limit is still allowed but counted as unpaid.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              setDraft((rows) => [
                ...rows,
                { code: "", name: "", monthlyLimit: null, yearlyLimit: null, isPaid: true, isActive: true },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Add type
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </header>
      <div className="flex flex-wrap items-end gap-4 border-b border-gray-100 bg-indigo-50/40 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Total paid leave (all types together)</div>
          <div className="text-xs text-gray-500">
            The overall balance every employee has. Each type&apos;s own limit applies too.
          </div>
        </div>
        <label className="grid gap-1 text-xs font-medium text-gray-600">
          Per month
          <input
            type="number"
            min={0}
            step={0.5}
            value={totalMonthly}
            onChange={(e) => setTotalMonthly(e.target.value)}
            placeholder="No limit"
            className={`${input} w-28`}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-gray-600">
          Per year
          <input
            type="number"
            min={0}
            step={0.5}
            value={totalYearly}
            onChange={(e) => setTotalYearly(e.target.value)}
            placeholder="No limit"
            className={`${input} w-28`}
          />
        </label>
      </div>
      {isLoading ? (
        <p className="p-4 text-sm text-gray-500">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Monthly limit</th>
              <th className="px-4 py-2">Yearly limit</th>
              <th className="px-4 py-2">Paid</th>
              <th className="px-4 py-2">Available</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {draft.map((type, index) => {
              const isHalfDay = type.code === "HALF_DAY";
              return (
                <tr key={`${type.code}-${index}`} className={type.isActive ? "" : "opacity-50"}>
                  <td className="px-4 py-2">
                    <input
                      value={type.name}
                      onChange={(e) => update(index, { name: e.target.value })}
                      placeholder="e.g. Sick Leave"
                      className={`${input} w-full`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={toInput(type.monthlyLimit)}
                      onChange={(e) => update(index, { monthlyLimit: fromInput(e.target.value) })}
                      placeholder="No limit"
                      disabled={!type.isPaid}
                      className={`${input} w-24`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={toInput(type.yearlyLimit)}
                      onChange={(e) => update(index, { yearlyLimit: fromInput(e.target.value) })}
                      placeholder="No limit"
                      disabled={!type.isPaid}
                      className={`${input} w-24`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={type.isPaid}
                      onChange={(e) => update(index, { isPaid: e.target.checked })}
                      title="Unpaid types never use the paid balance"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={type.isActive}
                        onChange={(e) => update(index, { isActive: e.target.checked })}
                      />
                      {type.isActive ? "On" : "Off"}
                    </label>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {isHalfDay ? (
                      <span className="text-[11px] text-gray-400">Built in</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                        title="Delete this leave type"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── Blocked days ──────────────────────────────────────────────────────────
function BlockedDaysCard({
  say,
  employees,
}: {
  say: (ok: boolean, text: string) => void;
  employees: Person[];
}) {
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const { data: blocks = [] } = useQuery<Block[]>({
    queryKey: ["leave-blocks", showInactive],
    queryFn: () =>
      api
        .get(`/api/attendance/time-off/leave-blocks${showInactive ? "?includeInactive=true" : ""}`)
        .then((r) => r.data.data),
  });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [scope, setScope] = useState<"ALL" | "EMPLOYEES">("ALL");
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("");
  const nameOf = useMemo(
    () => new Map(employees.map((e) => [e.employeeId, e.name])),
    [employees],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["leave-blocks"] });
  const create = useMutation({
    mutationFn: () =>
      api.post("/api/attendance/time-off/leave-blocks", {
        startDate,
        endDate: endDate || startDate,
        scope,
        employeeIds: picked,
        reason,
      }),
    onSuccess: () => {
      say(true, "Blocked. Leave can no longer be requested on those days.");
      setStartDate("");
      setEndDate("");
      setPicked([]);
      setReason("");
      refresh();
    },
    onError: (error) => say(false, errorText(error, "Could not block those days.")),
  });
  const toggle = useMutation({
    mutationFn: (block: Block) =>
      api.patch(`/api/attendance/time-off/leave-blocks/${block._id}`, {
        isActive: !block.isActive,
      }),
    onSuccess: () => refresh(),
    onError: (error) => say(false, errorText(error, "Could not update.")),
  });

  const visibleEmployees = employees.filter((e) =>
    `${e.name} ${e.employeeId}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <section className={card}>
      <header className="border-b border-gray-100 p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <CalendarX2 className="h-4 w-4" /> Blocked leave days
        </h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Stop leave requests on busy days — for everyone, or only for chosen people.
          Existing requests are not changed.
        </p>
      </header>
      <div className="grid gap-3 border-b border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-gray-600">
            From
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-gray-600">
            To (optional)
            <input
              type="date"
              min={startDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={input}
            />
          </label>
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            {(
              [
                ["ALL", "Everyone"],
                ["EMPLOYEES", "Selected people"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${scope === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="grid flex-1 gap-1 text-xs font-medium text-gray-600">
            Reason (shown to employees)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Launch day — all hands"
              className={`${input} min-w-[220px]`}
            />
          </label>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={!startDate || create.isPending || (scope === "EMPLOYEES" && picked.length === 0)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Ban className="h-4 w-4" /> Block
          </button>
        </div>
        {scope === "EMPLOYEES" ? (
          <div className="rounded-lg border border-gray-200 p-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search people…"
              className={`${input} mb-2 w-full`}
            />
            <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {visibleEmployees.map((employee) => (
                <label key={employee.employeeId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.includes(employee.employeeId)}
                    onChange={(e) =>
                      setPicked((ids) =>
                        e.target.checked
                          ? [...ids, employee.employeeId]
                          : ids.filter((id) => id !== employee.employeeId),
                      )
                    }
                  />
                  {employee.name} <span className="text-xs text-gray-400">{employee.employeeId}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">{picked.length} selected</p>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-xs font-semibold uppercase text-gray-500">Blocks</span>
        <label className="inline-flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show switched-off blocks
        </label>
      </div>
      {blocks.length === 0 ? (
        <p className="p-4 text-sm text-gray-500">No blocked days.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {blocks.map((block) => (
            <li key={block._id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${block.isActive ? "" : "opacity-50"}`}>
              <div className="text-sm">
                <span className="font-semibold text-gray-900">
                  {block.startDate === block.endDate ? block.startDate : `${block.startDate} → ${block.endDate}`}
                </span>{" "}
                <span className="text-gray-500">
                  ·{" "}
                  {block.scope === "ALL"
                    ? "Everyone"
                    : block.employeeIds.map((id) => nameOf.get(id) || id).join(", ")}
                </span>
                {block.reason ? <div className="text-xs text-gray-600">{block.reason}</div> : null}
                <div className="text-xs text-gray-400">
                  {block.createdByName ? `Added by ${block.createdByName}` : ""}
                  {block.updatedByName ? ` · last changed by ${block.updatedByName}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle.mutate(block)}
                disabled={toggle.isPending}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium"
              >
                {block.isActive ? "Switch off" : "Switch on"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


// ── Monthly / yearly balances and per-employee limits ─────────────────────
function UsageCell({ usage, limit }: { usage: Usage; limit: number | null }) {
  return (
    <div>
      <span className="text-gray-800">
        {usage.paid}/{limitText(limit)}
      </span>
      {usage.left !== null ? (
        <span className={`ml-1 text-[11px] ${usage.left === 0 ? "text-rose-600" : "text-emerald-600"}`}>
          ({usage.left} left)
        </span>
      ) : null}
      {usage.unpaid ? <div className="text-[11px] text-rose-600">{usage.unpaid} unpaid</div> : null}
    </div>
  );
}

function BalancesCard({ say }: { say: (ok: boolean, text: string) => void }) {
  const [month, setMonth] = useState(thisMonth());
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Balance | null>(null);
  const { data: balances = [], isLoading } = useQuery<Balance[]>({
    queryKey: ["leave-balances", month],
    queryFn: () =>
      api.get(`/api/attendance/time-off/leave-balances?month=${month}`).then((r) => r.data.data),
  });
  const activeTypes = useMemo(
    () => (balances[0]?.types || []).filter((type) => type.isActive),
    [balances],
  );
  const visible = balances.filter((b) =>
    `${b.name} ${b.employeeId}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section className={card}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <SlidersHorizontal className="h-4 w-4" /> Leave balances
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Worked out automatically (working days; approved and pending both count).
            Total paid leave first, then how it is split by type. Days beyond a limit
            are unpaid. Click a person to set their own limits.
          </p>
        </div>
        <div className="flex gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className={input} />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={input} />
        </div>
      </header>
      {isLoading ? (
        <p className="p-4 text-sm text-gray-500">Working out balances…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Employee</th>
                <th className="whitespace-nowrap bg-indigo-50 px-4 py-2 text-indigo-700">
                  Total — month
                </th>
                <th className="whitespace-nowrap bg-indigo-50 px-4 py-2 text-indigo-700">
                  Total — year
                </th>
                {activeTypes.map((type) => (
                  <th key={type.code} className="whitespace-nowrap px-4 py-2">
                    {type.name}
                    <div className="font-normal normal-case">month · year</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((balance) => (
                <tr
                  key={balance.employeeId}
                  onClick={() => setEditing(balance)}
                  className="cursor-pointer align-top hover:bg-gray-50"
                >
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{balance.name}</div>
                    <div className="text-xs text-gray-400">{balance.employeeId}</div>
                    {balance.total.hasOverride || balance.types.some((t) => t.hasOverride) ? (
                      <div className="text-[11px] text-indigo-500">own limits</div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap bg-indigo-50/40 px-4 py-2">
                    <UsageCell usage={balance.total.month} limit={balance.total.monthlyLimit} />
                  </td>
                  <td className="whitespace-nowrap bg-indigo-50/40 px-4 py-2">
                    <UsageCell usage={balance.total.year} limit={balance.total.yearlyLimit} />
                  </td>
                  {activeTypes.map((type) => {
                    const own = balance.types.find((t) => t.code === type.code);
                    if (!own) return <td key={type.code} />;
                    return (
                      <td key={type.code} className="whitespace-nowrap px-4 py-2 text-xs">
                        {own.isPaid ? (
                          <>
                            <UsageCell usage={own.month} limit={own.monthlyLimit} />
                            <div className="mt-1 text-gray-500">
                              Year: {own.year.paid}/{limitText(own.yearlyLimit)}
                              {own.year.unpaid ? ` · ${own.year.unpaid} unpaid` : ""}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-600">
                            {own.month.unpaid} · {own.year.unpaid} unpaid
                          </span>
                        )}
                        {own.year.pending ? (
                          <div className="text-[11px] text-amber-600">{own.year.pending} pending</div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? <AllowanceEditor balance={editing} onClose={() => setEditing(null)} say={say} /> : null}
    </section>
  );
}

type EffectiveLimits = {
  types: Array<{
    code: string;
    name: string;
    isPaid: boolean;
    isActive: boolean;
    hasOverride: boolean;
    monthlyLimit: number | null;
    yearlyLimit: number | null;
    defaultMonthlyLimit: number | null;
    defaultYearlyLimit: number | null;
  }>;
  total: {
    monthlyLimit: number | null;
    yearlyLimit: number | null;
    defaultMonthlyLimit: number | null;
    defaultYearlyLimit: number | null;
    hasOverride: boolean;
  };
};

function AllowanceEditor({
  balance,
  onClose,
  say,
}: {
  balance: Balance;
  onClose: () => void;
  say: (ok: boolean, text: string) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery<EffectiveLimits>({
    queryKey: ["leave-allowance", balance.employeeId],
    queryFn: () =>
      api
        .get(`/api/attendance/time-off/leave-allowances/${encodeURIComponent(balance.employeeId)}`)
        .then((r) => r.data.data),
  });
  // Blank = use the default.
  const [draft, setDraft] = useState<Record<string, { monthly: string; yearly: string }>>({});
  const [total, setTotal] = useState({ monthly: "", yearly: "" });
  useEffect(() => {
    if (!data) return;
    const next: Record<string, { monthly: string; yearly: string }> = {};
    data.types.forEach((limit) => {
      next[limit.code] = limit.hasOverride
        ? {
            monthly: limit.monthlyLimit !== limit.defaultMonthlyLimit ? toInput(limit.monthlyLimit) : "",
            yearly: limit.yearlyLimit !== limit.defaultYearlyLimit ? toInput(limit.yearlyLimit) : "",
          }
        : { monthly: "", yearly: "" };
    });
    setDraft(next);
    setTotal(
      data.total.hasOverride
        ? {
            monthly:
              data.total.monthlyLimit !== data.total.defaultMonthlyLimit ? toInput(data.total.monthlyLimit) : "",
            yearly:
              data.total.yearlyLimit !== data.total.defaultYearlyLimit ? toInput(data.total.yearlyLimit) : "",
          }
        : { monthly: "", yearly: "" },
    );
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/attendance/time-off/leave-allowances/${encodeURIComponent(balance.employeeId)}`, {
        totalMonthlyLimit: fromInput(total.monthly),
        totalYearlyLimit: fromInput(total.yearly),
        limits: Object.entries(draft)
          .filter(([, value]) => value.monthly.trim() !== "" || value.yearly.trim() !== "")
          .map(([code, value]) => ({
            code,
            monthlyLimit: fromInput(value.monthly),
            yearlyLimit: fromInput(value.yearly),
          })),
      }),
    onSuccess: () => {
      say(true, `Leave limits saved for ${balance.name}.`);
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["leave-allowance", balance.employeeId] });
      onClose();
    },
    onError: (error) => say(false, errorText(error, "Could not save limits.")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <div>
            <h3 className="font-semibold text-gray-900">{balance.name}&apos;s leave</h3>
            <p className="text-xs text-gray-500">
              {balance.month} and {balance.year}. Leave a limit blank to use the default.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>
        <div className="grid gap-3 border-b border-gray-100 bg-indigo-50/40 p-4 sm:grid-cols-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Total paid leave</div>
            <div className="text-xs text-gray-600">
              Month: {balance.total.month.paid}/{limitText(balance.total.monthlyLimit)} · Year:{" "}
              {balance.total.year.paid}/{limitText(balance.total.yearlyLimit)}
            </div>
            {balance.total.year.unpaid ? (
              <div className="text-xs text-rose-600">{balance.total.year.unpaid} unpaid this year</div>
            ) : null}
          </div>
          <label className="grid gap-1 text-xs font-medium text-gray-600">
            Own monthly total
            <input
              type="number"
              min={0}
              step={0.5}
              value={total.monthly}
              placeholder={`Default ${limitText(data?.total.defaultMonthlyLimit ?? null)}`}
              onChange={(e) => setTotal((t) => ({ ...t, monthly: e.target.value }))}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-gray-600">
            Own yearly total
            <input
              type="number"
              min={0}
              step={0.5}
              value={total.yearly}
              placeholder={`Default ${limitText(data?.total.defaultYearlyLimit ?? null)}`}
              onChange={(e) => setTotal((t) => ({ ...t, yearly: e.target.value }))}
              className={input}
            />
          </label>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Paid used (month · year)</th>
              <th className="px-4 py-2">Monthly limit</th>
              <th className="px-4 py-2">Yearly limit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data?.types || [])
              .filter((limit) => limit.isActive && limit.isPaid)
              .map((limit) => {
                const used = balance.types.find((t) => t.code === limit.code);
                const value = draft[limit.code] || { monthly: "", yearly: "" };
                return (
                  <tr key={limit.code}>
                    <td className="px-4 py-2 font-medium">{limit.name}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {used ? `${used.month.paid} · ${used.year.paid}` : "—"}
                      {used?.year.unpaid ? (
                        <span className="text-rose-600"> ({used.year.unpaid} unpaid)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={value.monthly}
                        placeholder={`Default ${limitText(limit.defaultMonthlyLimit)}`}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [limit.code]: { ...value, monthly: e.target.value } }))
                        }
                        className={`${input} w-28`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={value.yearly}
                        placeholder={`Default ${limitText(limit.defaultYearlyLimit)}`}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [limit.code]: { ...value, yearly: e.target.value } }))
                        }
                        className={`${input} w-28`}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <div className="flex justify-end gap-2 p-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save limits"}
          </button>
        </div>
      </div>
    </div>
  );
}
