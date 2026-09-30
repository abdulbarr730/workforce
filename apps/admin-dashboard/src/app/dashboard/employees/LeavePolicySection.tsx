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
  floatingOnTop: boolean;
  rolloverEnabled: boolean;
  rolloverHistory?: Array<{ from: string; enabled: boolean; byName?: string | null }>;
};

type Usage = {
  carriedIn?: number;
  paid: number;
  monthly?: number;
  floating?: number;
  unpaid: number;
  pending: number;
  left: number | null;
};
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
    floatingOnTop: boolean;
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
      <LeaveSummaryCard />
      <LeaveTypesCard say={say} />
      <BlockedDaysCard say={say} employees={employees} />
      <BalancesCard say={say} />
    </div>
  );
}

// ── Leave summary: what every employee has left ──────────────────────────
const add2 = (a: number | null, b: number | null) =>
  a === null || b === null ? null : a + b;
const min2 = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b);

/**
 * Paid leave an employee can still take: monthly leave left (with carry-over)
 * plus floating leave left when floating is on top; otherwise the smaller of
 * the monthly and yearly balances. null = no limit.
 */
const totalLeft = (total: Balance["total"]) =>
  total.floatingOnTop
    ? add2(total.month.left, total.year.left)
    : min2(total.month.left, total.year.left);

const shown = (value: number | null) => (value === null ? "No limit" : String(value));

function LeaveSummaryCard() {
  const [month, setMonth] = useState(thisMonth());
  const [search, setSearch] = useState("");
  const { data: balances = [], isLoading } = useQuery<Balance[]>({
    queryKey: ["leave-balances", month],
    queryFn: () =>
      api.get(`/api/attendance/time-off/leave-balances?month=${month}`).then((r) => r.data.data),
  });
  const rows = useMemo(
    () =>
      balances.map((b) => ({
        employeeId: b.employeeId,
        name: b.name,
        monthlyLeft: b.total.monthlyLimit === null ? null : b.total.month.left,
        carried: b.total.month.carriedIn || 0,
        floatingLeft: b.total.yearlyLimit === null ? null : b.total.year.left,
        floatingOnTop: b.total.floatingOnTop,
        totalLeft: totalLeft(b.total),
        unpaidYear: b.total.year.unpaid || 0,
        pending: b.total.year.pending || 0,
      })),
    [balances],
  );
  const visible = rows.filter((r) =>
    `${r.name} ${r.employeeId}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const sum = (values: Array<number | null>) => values.reduce<number>((s, v) => s + (v ?? 0), 0);
  const unlimited = (values: Array<number | null>) => values.filter((v) => v === null).length;
  const totals = {
    monthlyLeft: sum(visible.map((r) => r.monthlyLeft)),
    carried: sum(visible.map((r) => r.carried)),
    floatingLeft: sum(visible.map((r) => r.floatingLeft)),
    totalLeft: sum(visible.map((r) => r.totalLeft)),
    unpaidYear: sum(visible.map((r) => r.unpaidYear)),
    unlimitedMonthly: unlimited(visible.map((r) => r.monthlyLeft)),
    unlimitedFloating: unlimited(visible.map((r) => r.floatingLeft)),
  };

  const downloadCsv = () => {
    const header = [
      "Employee ID",
      "Employee",
      "Monthly leave left",
      "Carried over",
      "Floating / yearly left",
      "Total paid leave left",
      "Unpaid days this year",
      "Pending days",
    ];
    const lines = [header, ...visible.map((r) => [
      r.employeeId,
      r.name,
      shown(r.monthlyLeft),
      String(r.carried),
      shown(r.floatingLeft),
      shown(r.totalLeft),
      String(r.unpaidYear),
      String(r.pending),
    ])]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `leave_summary_${month}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={card}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <SlidersHorizontal className="h-4 w-4" /> Leave summary — all employees
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            How much paid leave each employee has left in the chosen month: monthly leave
            (including carried over), floating leave for the year, and the total they can still take.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className={input} />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={input} />
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!visible.length}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Download CSV
          </button>
        </div>
      </header>
      <div className="grid gap-3 border-b border-gray-100 p-4 sm:grid-cols-4">
        {[
          ["Monthly leave left", totals.monthlyLeft, totals.unlimitedMonthly],
          ["Of which carried over", totals.carried, 0],
          ["Floating / yearly left", totals.floatingLeft, totals.unlimitedFloating],
          ["Total paid leave left", totals.totalLeft, 0],
        ].map(([label, value, unlimitedCount]) => (
          <div key={String(label)} className="rounded-xl bg-indigo-50 px-4 py-3">
            <div className="text-xs font-bold uppercase text-indigo-700">{label}</div>
            <div className="text-2xl font-black text-gray-900">{value}</div>
            <div className="text-[11px] text-gray-500">
              {visible.length} employee(s){Number(unlimitedCount) ? ` · ${unlimitedCount} with no limit` : ""}
            </div>
          </div>
        ))}
      </div>
      {isLoading ? (
        <p className="p-4 text-sm text-gray-500">Working out balances…</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Employee</th>
                <th className="px-4 py-2">Monthly left</th>
                <th className="px-4 py-2">Floating / yearly left</th>
                <th className="px-4 py-2">Total left</th>
                <th className="px-4 py-2">Unpaid this year</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="bg-indigo-50/50 font-semibold">
                <td className="px-4 py-2">All employees</td>
                <td className="px-4 py-2">{totals.monthlyLeft}</td>
                <td className="px-4 py-2">{totals.floatingLeft}</td>
                <td className="px-4 py-2">{totals.totalLeft}</td>
                <td className="px-4 py-2 text-rose-600">{totals.unpaidYear || ""}</td>
              </tr>
              {visible.map((r) => (
                <tr key={r.employeeId}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-400">{r.employeeId}</div>
                  </td>
                  <td className="px-4 py-2">
                    {shown(r.monthlyLeft)}
                    {r.carried ? (
                      <span className="ml-1 text-[11px] text-indigo-600">({r.carried} carried)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    {shown(r.floatingLeft)}
                    <span className="ml-1 text-[11px] text-gray-400">
                      {r.floatingOnTop ? "floating" : "yearly cap"}
                    </span>
                  </td>
                  <td className={`px-4 py-2 font-semibold ${r.totalLeft === 0 ? "text-rose-600" : "text-gray-900"}`}>
                    {shown(r.totalLeft)}
                  </td>
                  <td className="px-4 py-2 text-rose-600">
                    {r.unpaidYear || ""}
                    {r.pending ? (
                      <span className="ml-1 text-[11px] text-amber-600">{r.pending} pending</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  const [floatingOnTop, setFloatingOnTop] = useState(false);
  const [rolloverEnabled, setRolloverEnabled] = useState(true);
  useEffect(() => {
    if (!policy) return;
    setDraft(policy.types);
    setTotalMonthly(toInput(policy.totalMonthlyLimit));
    setTotalYearly(toInput(policy.totalYearlyLimit));
    setFloatingOnTop(Boolean(policy.floatingOnTop));
    setRolloverEnabled(policy.rolloverEnabled !== false);
  }, [policy]);

  const save = useMutation({
    mutationFn: () =>
      api.put("/api/attendance/time-off/leave-policy", {
        types: draft,
        totalMonthlyLimit: fromInput(totalMonthly),
        totalYearlyLimit: fromInput(totalYearly),
        floatingOnTop,
        rolloverEnabled,
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
          <div className="text-sm font-semibold text-gray-900">Paid leave (all types together)</div>
          <div className="text-xs text-gray-500">
            Monthly leave can roll over (see below); floating leave resets every
            calendar year. Each type&apos;s own limit applies too. Beyond these, leave is unpaid.
          </div>
        </div>
        <label className="grid gap-1 text-xs font-medium text-gray-600">
          Paid per month
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
          {floatingOnTop ? "Floating per year" : "Paid per year (cap)"}
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
        <label className="flex max-w-md items-start gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={floatingOnTop}
            onChange={(e) => setFloatingOnTop(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <b>Floating leave on top of monthly leave</b>
            <br />
            {floatingOnTop
              ? "On: employees get the monthly paid leave PLUS the yearly floating leave (monthly used first, then floating)."
              : "Off: the yearly number is a cap that includes the monthly paid leave."}
            <br />
            Can be changed per person under Leave balances.
          </span>
        </label>
        <label className="flex max-w-md items-start gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={rolloverEnabled}
            onChange={(e) => setRolloverEnabled(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <b>Roll over unused monthly leave</b>
            <br />
            {rolloverEnabled
              ? "On: unused monthly paid leave carries to the next month, and into the next year."
              : "Off: from this month, unused monthly leave lapses. Leave already rolled over stays."}
            {policy?.rolloverHistory?.length ? (
              <>
                <br />
                <span className="text-gray-500">
                  History:{" "}
                  {policy.rolloverHistory
                    .map((h) => `${h.enabled ? "on" : "off"} from ${h.from}${h.byName ? ` (${h.byName})` : ""}`)
                    .join(", ")}
                </span>
              </>
            ) : null}
          </span>
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
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search people…"
                className={`${input} flex-1`}
              />
              <button
                type="button"
                onClick={() =>
                  setPicked((ids) =>
                    Array.from(new Set([...ids, ...visibleEmployees.map((e) => e.employeeId)])),
                  )
                }
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium"
              >
                Select all{filter.trim() ? " shown" : ""}
              </button>
              <button
                type="button"
                onClick={() => setPicked([])}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium"
              >
                Clear
              </button>
            </div>
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

/** Monthly paid leave: used this month, earned + carried over, left. */
function MonthTotalCell({ total }: { total: Balance["total"] }) {
  const m = total.month;
  if (total.monthlyLimit === null) {
    return <UsageCell usage={m} limit={null} />;
  }
  return (
    <div>
      <span className="text-gray-800">
        {m.monthly ?? m.paid} used of {total.monthlyLimit}
        {m.carriedIn ? ` + ${m.carriedIn} carried` : ""}
      </span>
      <div className={`text-[11px] ${m.left === 0 ? "text-rose-600" : "text-emerald-600"}`}>
        {m.left} left
      </div>
      {m.unpaid ? <div className="text-[11px] text-rose-600">{m.unpaid} unpaid</div> : null}
    </div>
  );
}

/** Floating leave (on top) or the yearly cap. */
function YearTotalCell({ total }: { total: Balance["total"] }) {
  const y = total.year;
  return (
    <div>
      <div className="text-[11px] uppercase text-gray-400">
        {total.floatingOnTop ? "Floating" : "Yearly cap"}
      </div>
      <span className="text-gray-800">
        {total.floatingOnTop ? y.floating ?? 0 : y.paid}/{limitText(total.yearlyLimit)}
      </span>
      {y.left !== null ? (
        <span className={`ml-1 text-[11px] ${y.left === 0 ? "text-rose-600" : "text-emerald-600"}`}>
          ({y.left} left)
        </span>
      ) : null}
      {y.unpaid ? <div className="text-[11px] text-rose-600">{y.unpaid} unpaid this year</div> : null}
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
                  Monthly paid leave
                </th>
                <th className="whitespace-nowrap bg-indigo-50 px-4 py-2 text-indigo-700">
                  Floating / yearly
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
                    <MonthTotalCell total={balance.total} />
                  </td>
                  <td className="whitespace-nowrap bg-indigo-50/40 px-4 py-2">
                    <YearTotalCell total={balance.total} />
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
    defaultFloatingOnTop: boolean;
    ownFloatingOnTop: boolean | null;
    hasOverride: boolean;
  };
  opening: {
    asOfMonth: string;
    monthlyCarried: number;
    floatingLeft: number | null;
    setByName?: string | null;
    setAt?: string | null;
  } | null;
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
  // "" = company setting, "yes" / "no" = this person's own choice.
  const [floating, setFloating] = useState<"" | "yes" | "no">("");
  // Starting balance: from this month on everything is calculated automatically.
  const [opening, setOpening] = useState({ asOfMonth: "", monthlyCarried: "", floatingLeft: "" });
  const [removeOpening, setRemoveOpening] = useState(false);
  useEffect(() => {
    if (!data) return;
    setOpening(
      data.opening
        ? {
            asOfMonth: data.opening.asOfMonth,
            monthlyCarried: toInput(data.opening.monthlyCarried),
            floatingLeft: toInput(data.opening.floatingLeft),
          }
        : { asOfMonth: "", monthlyCarried: "", floatingLeft: "" },
    );
    setRemoveOpening(false);
    setFloating(
      data.total.ownFloatingOnTop === null || data.total.ownFloatingOnTop === undefined
        ? ""
        : data.total.ownFloatingOnTop
          ? "yes"
          : "no",
    );
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
        floatingOnTop: floating === "" ? null : floating === "yes",
        opening: removeOpening
          ? null
          : opening.asOfMonth
            ? {
                asOfMonth: opening.asOfMonth,
                monthlyCarried: fromInput(opening.monthlyCarried) ?? 0,
                floatingLeft: fromInput(opening.floatingLeft),
              }
            : undefined,
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
            <div className="text-sm font-semibold text-gray-900">Paid leave</div>
            <div className="text-xs text-gray-600">
              Month: {balance.total.month.monthly ?? balance.total.month.paid} used
              {balance.total.month.carriedIn ? `, ${balance.total.month.carriedIn} carried over` : ""}
              {balance.total.month.left !== null ? `, ${balance.total.month.left} left` : ""}
            </div>
            <div className="text-xs text-gray-600">
              {balance.total.floatingOnTop ? "Floating" : "Year"}:{" "}
              {balance.total.floatingOnTop ? balance.total.year.floating ?? 0 : balance.total.year.paid}/
              {limitText(balance.total.yearlyLimit)}
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
            Own yearly / floating
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
          <label className="grid gap-1 text-xs font-medium text-gray-600 sm:col-span-3">
            Monthly leave + floating leave for this person?
            <select
              value={floating}
              onChange={(e) => setFloating(e.target.value as "" | "yes" | "no")}
              className={input}
            >
              <option value="">
                Company setting ({data?.total.defaultFloatingOnTop ? "yes, both" : "no, yearly is a cap"})
              </option>
              <option value="yes">Yes — monthly paid leave PLUS floating leave</option>
              <option value="no">No — the yearly number caps all paid leave</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 border-b border-gray-100 bg-emerald-50/40 p-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <div className="text-sm font-semibold text-gray-900">Starting balance</div>
            <div className="text-xs text-gray-600">
              What {balance.name} has right now. From this month on, leave is added, rolled
              over and used automatically, and the balance is saved every month. Leave taken
              before this month is treated as already counted in these numbers.
            </div>
            {data?.opening ? (
              <div className="mt-1 text-[11px] text-gray-500">
                Set from {data.opening.asOfMonth}
                {data.opening.setByName ? ` by ${data.opening.setByName}` : ""}
                {data.opening.setAt ? ` on ${new Date(data.opening.setAt).toLocaleDateString("en-IN")}` : ""}
              </div>
            ) : null}
          </div>
          <label className="grid gap-1 text-xs font-medium text-gray-600">
            From month
            <input
              type="month"
              value={opening.asOfMonth}
              onChange={(e) => setOpening((o) => ({ ...o, asOfMonth: e.target.value }))}
              disabled={removeOpening}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-gray-600">
            Carried-over monthly leave (days)
            <input
              type="number"
              min={0}
              step={0.5}
              value={opening.monthlyCarried}
              placeholder="0"
              onChange={(e) => setOpening((o) => ({ ...o, monthlyCarried: e.target.value }))}
              disabled={removeOpening}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-gray-600">
            {balance.total.floatingOnTop ? "Floating leave left this year" : "Yearly leave left this year"}
            <input
              type="number"
              min={0}
              step={0.5}
              value={opening.floatingLeft}
              placeholder="Full year"
              onChange={(e) => setOpening((o) => ({ ...o, floatingLeft: e.target.value }))}
              disabled={removeOpening}
              className={input}
            />
          </label>
          {data?.opening ? (
            <label className="flex items-center gap-2 text-xs text-rose-700 sm:col-span-3">
              <input
                type="checkbox"
                checked={removeOpening}
                onChange={(e) => setRemoveOpening(e.target.checked)}
              />
              Remove the starting balance (go back to the automatic calculation only)
            </label>
          ) : null}
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
