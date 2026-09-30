"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Power, Save, ShieldCheck, UserCog, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { apiErrorMessage } from "@/components/auth/SetPasswordForm";
import { PasswordActionsModal } from "../employees/PasswordActionsModal";

type CatalogPage = {
  key: string;
  label: string;
  group: string;
  actions: Array<{ key: string; label: string }>;
};
type Role = {
  key: string;
  name: string;
  description: string;
  builtIn: boolean;
  baseRole: string;
  adminPortal: boolean;
  fullAccess: boolean;
  permissions: string[];
  isActive: boolean;
  people: number;
};
type Person = { _id: string; name: string; email: string; role: string; isActive?: boolean; employeeId: string };

const BASE_LABEL: Record<string, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  HR: "HR",
  ADMIN: "Admin",
};

const box = "rounded-xl border border-gray-200 bg-white";
const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500";

export default function RolesPage() {
  const access = useAccess();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<Person | null>(null);
  const [newLogin, setNewLogin] = useState(false);

  const { data: catalog } = useQuery<{ pages: CatalogPage[]; baseRoles: string[] }>({
    queryKey: ["access-catalog"],
    queryFn: () => api.get("/api/access/catalog").then((r) => r.data.data),
  });
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["access-roles"],
    queryFn: () => api.get("/api/access/roles").then((r) => r.data.data),
  });
  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  useEffect(() => {
    if (!selectedKey && roles.length) setSelectedKey(roles[0].key);
  }, [roles, selectedKey]);
  useEffect(() => {
    if (creating) return;
    const role = roles.find((r) => r.key === selectedKey);
    setDraft(role ? { ...role, permissions: [...role.permissions] } : null);
  }, [roles, selectedKey, creating]);

  const groups = useMemo(() => {
    const map = new Map<string, CatalogPage[]>();
    for (const page of catalog?.pages || []) {
      map.set(page.group, [...(map.get(page.group) || []), page]);
    }
    return [...map.entries()];
  }, [catalog]);

  const portalRoles = roles.filter((r) => r.adminPortal && r.isActive);
  const portalPeople = people.filter(
    (p) => p.role !== "SUPER_ADMIN" && portalRoles.some((r) => r.key === p.role),
  );

  const save = useMutation({
    mutationFn: (role: Role) =>
      creating
        ? api.post("/api/access/roles", role)
        : api.put(`/api/access/roles/${encodeURIComponent(role.key)}`, role),
    onSuccess: (res: any) => {
      setNotice({ ok: true, text: res?.data?.message || "Saved." });
      const key = res?.data?.data?.key;
      setCreating(false);
      if (key) setSelectedKey(key);
      qc.invalidateQueries({ queryKey: ["access-roles"] });
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err, "Could not save the role.") }),
  });

  const toggleActive = useMutation({
    mutationFn: (role: Role) =>
      api.patch(`/api/access/roles/${encodeURIComponent(role.key)}/active`, { isActive: !role.isActive }),
    onSuccess: (res: any) => {
      setNotice({ ok: true, text: res?.data?.message || "Saved." });
      qc.invalidateQueries({ queryKey: ["access-roles"] });
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err, "Could not change the role.") }),
  });

  const changeRole = useMutation({
    mutationFn: ({ person, role }: { person: Person; role: string }) => api.put(`/api/users/${person._id}`, { role }),
    onSuccess: () => {
      setNotice({ ok: true, text: "Role changed. It applies within a minute." });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["access-roles"] });
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err, "Could not change the role.") }),
  });

  if (access && !access.superAdmin) {
    return <p className="text-sm text-gray-500">This page isn&apos;t available for your role.</p>;
  }

  const has = (perm: string) => Boolean(draft?.permissions.includes(perm));
  const setPerm = (perm: string, on: boolean) => {
    if (!draft) return;
    const page = perm.split(".")[0];
    let next = draft.permissions.filter((p) => p !== perm);
    if (on) next.push(perm);
    // Actions need the page; removing the page removes its actions.
    if (on && !perm.endsWith(".view")) next.push(`${page}.view`);
    if (!on && perm.endsWith(".view")) next = next.filter((p) => !p.startsWith(`${page}.`));
    setDraft({ ...draft, permissions: [...new Set(next)] });
  };
  const setGroup = (pages: CatalogPage[], on: boolean) => {
    if (!draft) return;
    const keys = pages.flatMap((p) => [`${p.key}.view`, ...p.actions.map((a) => `${p.key}.${a.key}`)]);
    const rest = draft.permissions.filter((p) => !keys.includes(p));
    setDraft({ ...draft, permissions: on ? [...rest, ...keys] : rest });
  };

  const startNew = () => {
    setCreating(true);
    setSelectedKey(null);
    setDraft({
      key: "",
      name: "",
      description: "",
      builtIn: false,
      baseRole: "ADMIN",
      adminPortal: true,
      fullAccess: false,
      permissions: ["overview.view"],
      isActive: true,
      people: 0,
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            <UserCog className="h-4 w-4" /> Roles & Logins
          </div>
          <h1 className="mt-3 text-2xl font-black text-slate-950">Who can do what</h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose which roles open the admin portal, which pages they see and what they can do on each page.
            Roles are never deleted — switch them off instead.
          </p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "#FF9900" }}
        >
          <Plus className="h-4 w-4" /> New role
        </button>
      </header>

      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
            notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Role list */}
        <div className={`${box} h-fit p-2`}>
          {roles.map((role) => (
            <button
              key={role.key}
              onClick={() => {
                setCreating(false);
                setSelectedKey(role.key);
              }}
              className={`w-full rounded-lg px-3 py-2.5 text-left ${
                selectedKey === role.key && !creating ? "bg-indigo-50" : "hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${role.isActive ? "text-gray-900" : "text-gray-400 line-through"}`}>
                  {role.name}
                </span>
                <span className="text-[11px] text-gray-500">{role.people} people</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {role.adminPortal && (
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">Admin portal</span>
                )}
                {!role.builtIn && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                    acts as {BASE_LABEL[role.baseRole] || role.baseRole}
                  </span>
                )}
                {!role.isActive && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700">Off</span>}
              </div>
            </button>
          ))}
          {creating && (
            <div className="rounded-lg bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700">New role…</div>
          )}
        </div>

        {/* Editor */}
        {draft && (
          <div className={`${box} p-5`}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-gray-700">
                Role name
                <input
                  className={inputCls}
                  value={draft.name}
                  placeholder="e.g. CEO, Operations"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-gray-700">
                Acts as (on the server)
                <select
                  className={inputCls}
                  value={draft.baseRole}
                  disabled={draft.builtIn}
                  onChange={(e) => setDraft({ ...draft, baseRole: e.target.value })}
                >
                  {(catalog?.baseRoles || ["EMPLOYEE", "MANAGER", "HR", "ADMIN"]).map((b) => (
                    <option key={b} value={b}>
                      {BASE_LABEL[b] || b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-gray-700 md:col-span-2">
                Description
                <input
                  className={inputCls}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.adminPortal}
                  onChange={(e) => setDraft({ ...draft, adminPortal: e.target.checked })}
                />
                Can sign in to the admin portal
              </label>
              {draft.adminPortal && (
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.fullAccess}
                    onChange={(e) => setDraft({ ...draft, fullAccess: e.target.checked })}
                  />
                  Full access (every page and action, including new ones)
                </label>
              )}
            </div>

            {draft.adminPortal && !draft.fullAccess && (
              <div className="mt-5 space-y-4">
                <p className="text-xs text-gray-500">
                  Tick the pages this role sees, then what it can do on each page. Everything not ticked is hidden and
                  refused by the server.
                </p>
                {groups.map(([group, pages]) => {
                  const allOn = pages.every(
                    (p) => has(`${p.key}.view`) && p.actions.every((a) => has(`${p.key}.${a.key}`)),
                  );
                  return (
                    <div key={group} className="rounded-lg border border-gray-100">
                      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-gray-600">{group}</span>
                        <button
                          onClick={() => setGroup(pages, !allOn)}
                          className="text-[11px] font-medium text-indigo-600 hover:underline"
                        >
                          {allOn ? "Clear all" : "Select all"}
                        </button>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {pages.map((page) => (
                          <div key={page.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                            <label className="flex w-44 items-center gap-2 text-sm font-medium text-gray-800">
                              <input
                                type="checkbox"
                                checked={has(`${page.key}.view`)}
                                onChange={(e) => setPerm(`${page.key}.view`, e.target.checked)}
                              />
                              {page.label}
                            </label>
                            {page.actions.map((action) => (
                              <label
                                key={action.key}
                                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                                  has(`${page.key}.${action.key}`)
                                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                    : "border-gray-200 text-gray-600"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={has(`${page.key}.${action.key}`)}
                                  onChange={(e) => setPerm(`${page.key}.${action.key}`, e.target.checked)}
                                />
                                {action.label}
                              </label>
                            ))}
                            {page.actions.length === 0 && <span className="text-xs text-gray-400">View only</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <div>
                {!draft.builtIn && !creating && (
                  <button
                    onClick={() => toggleActive.mutate(draft)}
                    disabled={toggleActive.isPending}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      draft.isActive ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    <Power className="h-4 w-4" /> {draft.isActive ? "Switch role off" : "Switch role on"}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {creating && (
                  <button
                    onClick={() => {
                      setCreating(false);
                      setSelectedKey(roles[0]?.key || null);
                    }}
                    className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => save.mutate(draft)}
                  disabled={save.isPending || !draft.name.trim()}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" /> {creating ? "Create role" : "Save role"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Admin-portal logins */}
      <section className={box}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <ShieldCheck className="h-4 w-4 text-indigo-600" /> Admin-portal logins
            </h2>
            <p className="text-xs text-gray-500">
              People whose role opens the admin portal. Change their role or manage their password here; everyone else
              is on the Employees page. Your own password is under My Account.
            </p>
          </div>
          <button
            onClick={() => setNewLogin(true)}
            className="flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            <UserPlus className="h-4 w-4" /> New admin login
          </button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2 text-right">Password</th>
              </tr>
            </thead>
            <tbody>
              {portalPeople.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">
                    No one else has admin-portal access yet.
                  </td>
                </tr>
              )}
              {portalPeople.map((person) => (
                <tr key={person._id} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {person.name}
                    {person.isActive === false && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{person.email}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={person.role}
                      onChange={(e) => changeRole.mutate({ person, role: e.target.value })}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
                    >
                      {roles
                        .filter((r) => r.isActive || r.key === person.role)
                        .map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setPasswordTarget(person)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {passwordTarget && <PasswordActionsModal target={passwordTarget} onClose={() => setPasswordTarget(null)} />}
      {newLogin && (
        <NewLoginModal
          roles={portalRoles}
          onClose={() => setNewLogin(false)}
          onDone={(text) => {
            setNotice({ ok: true, text });
            setNewLogin(false);
            qc.invalidateQueries({ queryKey: ["users"] });
            qc.invalidateQueries({ queryKey: ["access-roles"] });
          }}
        />
      )}
    </div>
  );
}

function NewLoginModal({
  roles,
  onClose,
  onDone,
}: {
  roles: Role[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", role: roles[0]?.key || "ADMIN", password: "", sendLoginEmail: true });
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: form.name, email: form.email, role: form.role, sendLoginEmail: form.sendLoginEmail };
      if (form.password) body.password = form.password;
      return api.post("/api/users", body);
    },
    onSuccess: (res: any) => onDone(res?.data?.message || "Login created."),
    onError: (err) => setError(apiErrorMessage(err, "Could not create the login.")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">New admin-portal login</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <input className={inputCls} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={inputCls} placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            className={inputCls}
            placeholder="Password (leave blank to email a one-time password)"
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.sendLoginEmail || !form.password}
              disabled={!form.password}
              onChange={(e) => setForm({ ...form, sendLoginEmail: e.target.checked })}
            />
            Email the login details (one-time password — they choose their own at first sign-in)
          </label>
          {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.name.trim() || !form.email.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {create.isPending ? "Creating…" : "Create login"}
          </button>
        </div>
      </div>
    </div>
  );
}
