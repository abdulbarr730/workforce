"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Umbrella } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type Usage = { paid: number; unpaid: number; pending: number; left: number | null };
type Balance = {
  total: { monthlyLimit: number | null; yearlyLimit: number | null; month: Usage; year: Usage };
  types: Array<{
    code: string;
    name: string;
    isPaid: boolean;
    isActive: boolean;
    monthlyLimit: number | null;
    yearlyLimit: number | null;
    month: Usage;
    year: Usage;
  }>;
};

const left = (usage: Usage, limit: number | null) =>
  limit === null ? "No limit" : `${usage.left} of ${limit}`;

/** Paid leave left this month and this year, then the split by type. */
export function LeaveBalanceCard() {
  const user = useAuthStore((s) => s.user);
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { data } = useQuery<Balance>({
    queryKey: ["my-leave-balance", user?.employeeId],
    queryFn: () =>
      api.get(`/api/attendance/time-off/leave-balance?month=${month}`).then((r) => r.data.data),
    enabled: !!user,
  });
  if (!data) return null;
  const paidTypes = data.types.filter((type) => type.isActive && type.isPaid && type.code !== "HALF_DAY");

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Umbrella className="h-5 w-5 text-indigo-500" /> Paid leave left
        </h2>
        <Link href="/dashboard/requests" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
          Request leave →
        </Link>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-indigo-50 px-4 py-3">
          <div className="text-xs font-bold uppercase text-indigo-700">This month</div>
          <div className="text-2xl font-black text-gray-900">
            {left(data.total.month, data.total.monthlyLimit)}
          </div>
        </div>
        <div className="rounded-xl bg-indigo-50 px-4 py-3">
          <div className="text-xs font-bold uppercase text-indigo-700">This year</div>
          <div className="text-2xl font-black text-gray-900">
            {left(data.total.year, data.total.yearlyLimit)}
          </div>
        </div>
      </div>
      {paidTypes.length ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {paidTypes.map((type) => (
            <span key={type.code} className="rounded-full border border-gray-200 px-3 py-1 text-gray-700">
              {type.name}: {left(type.month, type.monthlyLimit)} this month
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-gray-500">
        Leave beyond your paid balance can still be requested — those days are unpaid.
        {data.total.year.unpaid ? ` You have ${data.total.year.unpaid} unpaid day(s) this year.` : ""}
      </p>
    </div>
  );
}
