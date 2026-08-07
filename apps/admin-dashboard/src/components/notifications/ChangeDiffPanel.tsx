"use client";

import type { AdminNotification } from "@/hooks/use-admin-notifications";
import { ArrowRight, FilePenLine, Plus, Trash2 } from "lucide-react";

const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value, null, 2);
};

export function ChangeDiffPanel({
  notification,
}: {
  notification: AdminNotification;
}) {
  const added = notification.diff?.added ?? [];
  const removed = notification.diff?.removed ?? [];
  const changed = notification.diff?.changed ?? [];

  return (
    <section className="rounded-2xl border border-red-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-red-100 bg-red-50/70 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-red-800">
            <FilePenLine className="h-4 w-4" /> {notification.title}
          </p>
          <p className="mt-1 text-sm text-gray-700">{notification.message}</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>{new Date(notification.createdAt).toLocaleString()}</p>
          {notification.changedBy?.name && (
            <p className="mt-1">Changed by {notification.changedBy.name}</p>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {notification.reason && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <span className="font-semibold text-amber-900">Reason:</span>{" "}
            <span className="text-amber-800">{notification.reason}</span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-700">
              <Trash2 className="h-3.5 w-3.5" /> Removed / previous
            </p>
            {removed.length ? (
              <ul className="space-y-1.5 text-sm text-red-900">
                {removed.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="break-words line-through decoration-red-400"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Nothing was removed.</p>
            )}
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
              <Plus className="h-3.5 w-3.5" /> Added / new
            </p>
            {added.length ? (
              <ul className="space-y-1.5 text-sm text-emerald-900">
                {added.map((item, index) => (
                  <li key={`${item}-${index}`} className="break-words">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Nothing new was added.</p>
            )}
          </div>
        </div>

        {changed.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-600">
              Changed fields
            </p>
            {changed.map((item, index) => (
              <div
                key={`${item.field}-${index}`}
                className="grid gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm md:grid-cols-[8rem_1fr_auto_1fr] md:items-start"
              >
                <span className="font-semibold capitalize text-gray-700">
                  {item.field.replace(/([A-Z])/g, " $1")}
                </span>
                <pre className="whitespace-pre-wrap break-words font-sans text-red-700">
                  {displayValue(item.before)}
                </pre>
                <ArrowRight className="mt-0.5 hidden h-4 w-4 text-gray-400 md:block" />
                <pre className="whitespace-pre-wrap break-words font-sans text-emerald-700">
                  {displayValue(item.after)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
