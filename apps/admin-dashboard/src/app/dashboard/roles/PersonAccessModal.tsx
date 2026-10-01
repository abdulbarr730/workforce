"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Access } from "@/lib/access";
import { apiErrorMessage } from "@/components/auth/SetPasswordForm";

type CatalogPage = { key: string; label: string; group: string; actions: Array<{ key: string; label: string }> };
type PersonAccess = {
  user: { _id: string; name: string; email: string; employeeId: string; role: string };
  roleName: string;
  roleAccess: Access;
  override: { adminPortal: boolean | null; grant: string[]; revoke: string[] };
  effective: Access;
};

/**
 * One person's access on top of their role: they keep the role (e.g.
 * Employee) and get extra pages / actions, or lose some.
 */
export function PersonAccessModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: catalog } = useQuery<{ pages: CatalogPage[] }>({
    queryKey: ["access-catalog"],
    queryFn: () => api.get("/api/access/catalog").then((r) => r.data.data),
  });
  const { data, isLoading } = useQuery<PersonAccess>({
    queryKey: ["person-access", userId],
    queryFn: () => api.get(`/api/access/users/${userId}`).then((r) => r.data.data),
  });

  const [portal, setPortal] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setPortal(data.override.adminPortal);
    setSelected(new Set(data.effective.adminPortal ? data.effective.permissions : data.override.grant));
  }, [data]);

  const fromRole = useMemo(
    () => new Set(data?.roleAccess.adminPortal ? data.roleAccess.permissions : []),
    [data],
  );
  const groups = useMemo(() => {
    const map = new Map<string, CatalogPage[]>();
    for (const page of catalog?.pages || []) map.set(page.group, [...(map.get(page.group) || []), page]);
    return [...map.entries()];
  }, [catalog]);

  const toggle = (perm: string, on: boolean) => {
    const next = new Set(selected);
    const page = perm.split(".")[0];
    if (on) {
      next.add(perm);
      next.add(`${page}.view`);
    } else {
      next.delete(perm);
      if (perm.endsWith(".view")) for (const p of [...next]) if (p.startsWith(`${page}.`)) next.delete(p);
    }
    setSelected(next);
  };

  async function save(reset = false) {
    if (!data) return;
    setSaving(true);
    setResult(null);
    try {
      const body = reset
        ? { adminPortal: null, grant: [], revoke: [] }
        : portal === false
          ? { adminPortal: false, grant: [], revoke: [] }
          : {
              adminPortal: portal,
              grant: [...selected].filter((p) => !fromRole.has(p)),
              revoke: [...fromRole].filter((p) => !selected.has(p)),
            };
      const res = await api.put(`/api/access/users/${userId}`, body);
      setResult({ ok: true, text: res.data?.message || "Saved." });
      qc.invalidateQueries({ queryKey: ["person-access", userId] });
      qc.invalidateQueries({ queryKey: ["personal-access"] });
    } catch (err) {
      setResult({ ok: false, text: apiErrorMessage(err, "Could not save.") });
    } finally {
      setSaving(false);
    }
  }

  const matrixOn = portal !== false;
  const extras = [...selected].filter((p) => !fromRole.has(p)).length;
  const removed = [...fromRole].filter((p) => !selected.has(p)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <ShieldCheck className="h-4 w-4 text-indigo-600" /> Access — {data?.user.name || "…"}
            </h3>
            <p className="text-xs text-gray-500">
              {data?.user.email} · role: <b>{data?.roleName}</b> (the role stays; these settings are for this person only)
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading || !data ? (
          <p className="p-5 text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-700">Admin portal</p>
              <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm">
                {(
                  [
                    [null, `As their role (${data.roleAccess.adminPortal ? "on" : "off"})`],
                    [true, "On"],
                    [false, "Off"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={String(value)}
                    onClick={() => setPortal(value)}
                    className={`rounded-md px-3 py-1.5 ${portal === value ? "bg-white font-semibold shadow-sm" : "text-gray-600"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!data.roleAccess.adminPortal && portal === null && (
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Ticking any page below gives them the admin portal with just those pages. Their agent and employee
                  dashboard stay exactly as a {data.roleName}.
                </p>
              )}
            </div>

            {matrixOn && (
              <>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">Grey = from the role</span>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">{extras} extra for this person</span>
                  <span className="rounded bg-rose-50 px-2 py-0.5 text-rose-700">{removed} taken away</span>
                </div>
                {groups.map(([group, pages]) => (
                  <div key={group} className="rounded-lg border border-gray-100">
                    <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-600">
                      {group}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {pages.map((page) => (
                        <div key={page.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                          {[{ key: "view", label: page.label, isPage: true }, ...page.actions.map((a) => ({ ...a, isPage: false }))].map(
                            (item) => {
                              const perm = `${page.key}.${item.key}`;
                              const on = selected.has(perm);
                              const inRole = fromRole.has(perm);
                              const tone =
                                on && !inRole
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : !on && inRole
                                    ? "border-rose-200 bg-rose-50 text-rose-700 line-through"
                                    : on
                                      ? "border-gray-200 bg-gray-50 text-gray-700"
                                      : "border-gray-200 text-gray-500";
                              return (
                                <label
                                  key={perm}
                                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${tone} ${
                                    item.isPage ? "w-44 font-semibold" : ""
                                  }`}
                                >
                                  <input type="checkbox" checked={on} onChange={(e) => toggle(perm, e.target.checked)} />
                                  {item.label}
                                </label>
                              );
                            },
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}

            {result && (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {result.text}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => save(true)}
            disabled={saving || !data}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            <RotateCcw className="h-4 w-4" /> Same as their role
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Close
            </button>
            <button
              onClick={() => save(false)}
              disabled={saving || !data}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save access"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
