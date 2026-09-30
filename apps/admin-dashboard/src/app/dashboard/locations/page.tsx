"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crosshair, MapPin, Plus, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

type Settings = { markRequired: boolean; locationRequired: boolean; requiredFrom: string | null };
type Location = {
  _id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  wifiNames: string[];
  publicIps: string[];
  appliesTo: "ALL" | "EMPLOYEES";
  employeeIds: string[];
  isActive: boolean;
};
type Mark = {
  _id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  laptopOpenAt?: string | null;
  markedAt?: string | null;
  locationReachedAt?: string | null;
  loginTime?: string | null;
  status: "WAITING_LOCATION" | "PENDING_APPROVAL" | "REJECTED" | "MARKED";
  locationName?: string | null;
  method?: string | null;
  remoteReason?: string | null;
  remoteDecisionNote?: string | null;
  remoteDecidedByName?: string | null;
};
type Person = { employeeId: string; name: string; isActive?: boolean; role?: string };

const card = "rounded-xl border border-gray-200 bg-white";
const input =
  "rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900";
const errorText = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.message || fallback;
const clock = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const STATUS: Record<Mark["status"], { label: string; cls: string }> = {
  MARKED: { label: "Marked", cls: "bg-emerald-100 text-emerald-800" },
  WAITING_LOCATION: { label: "Not at location yet", cls: "bg-amber-100 text-amber-800" },
  PENDING_APPROVAL: { label: "Needs approval", cls: "bg-sky-100 text-sky-800" },
  REJECTED: { label: "Rejected", cls: "bg-rose-100 text-rose-800" },
};

const METHOD: Record<string, string> = {
  GPS: "Location",
  WIFI: "Office Wi-Fi",
  IP: "Office internet",
  NONE: "No location needed",
  REMOTE: "Elsewhere (approved)",
};

export default function LocationsPage() {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const say = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 7000);
  };
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });
  const employees: Person[] = useMemo(() => {
    const rows = Array.isArray(usersData) ? usersData : usersData?.users || [];
    return (rows as Person[])
      .filter((u) => u.isActive !== false && u.employeeId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [usersData]);

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
          <MapPin className="h-4 w-4" /> Locations
        </div>
        <h1 className="mt-3 text-2xl font-black text-slate-950">Mark Attendance &amp; work locations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Employees mark their attendance in the agent with &quot;Mark Attendance&quot; (tracking works
          as normal before and after). At a work location, the time they opened the laptop is their
          login; away from it, the login is when they arrive — or they can work from elsewhere with
          a reason you approve.
        </p>
      </header>
      {notice ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}
        >
          {notice.text}
        </div>
      ) : null}
      <SettingsCard say={say} />
      <MarksCard say={say} />
      <LocationsCard say={say} employees={employees} />
    </div>
  );
}

// ── On / off ─────────────────────────────────────────────────────────────
function SettingsCard({ say }: { say: (ok: boolean, text: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<Settings>({
    queryKey: ["mark-settings"],
    queryFn: () => api.get("/api/attendance/mark/settings").then((r) => r.data.data),
  });
  const [markRequired, setMarkRequired] = useState(false);
  const [locationRequired, setLocationRequired] = useState(false);
  useEffect(() => {
    if (!data) return;
    setMarkRequired(data.markRequired);
    setLocationRequired(data.locationRequired);
  }, [data]);
  const save = useMutation({
    mutationFn: () =>
      api.put("/api/attendance/mark/settings", { markRequired, locationRequired }),
    onSuccess: () => {
      say(true, "Saved.");
      qc.invalidateQueries({ queryKey: ["mark-settings"] });
    },
    onError: (error) => say(false, errorText(error, "Could not save.")),
  });
  const turningOn = markRequired && !data?.markRequired;

  return (
    <section className={`${card} p-4`}>
      <h2 className="text-base font-semibold text-gray-900">Switches</h2>
      <div className="mt-3 grid gap-3">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={markRequired}
            onChange={(e) => setMarkRequired(e.target.checked)}
          />
          <span>
            <b>Attendance only from &quot;Start &amp; Mark Attendance&quot;</b>
            <br />
            <span className="text-gray-500">
              The agent tracks and shows popups as normal, but Present / Late / Half day come only
              from the employee clicking &quot;Mark Attendance&quot;. Off: attendance comes from laptop
              activity as before.
            </span>
            {data?.requiredFrom && data.markRequired ? (
              <span className="block text-xs text-gray-400">On since {data.requiredFrom}</span>
            ) : null}
          </span>
        </label>
        <label className={`flex items-start gap-3 text-sm ${markRequired ? "" : "opacity-50"}`}>
          <input
            type="checkbox"
            className="mt-1"
            disabled={!markRequired}
            checked={locationRequired}
            onChange={(e) => setLocationRequired(e.target.checked)}
          />
          <span>
            <b>Check the work location</b>
            <br />
            <span className="text-gray-500">
              Employees with a work location below must be there (location, office Wi-Fi or office
              internet). Employees without one are not checked.
            </span>
          </span>
        </label>
        {turningOn ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Before switching this on, make sure every laptop has the new agent version. Older agents
            have no &quot;Mark Attendance&quot; button, so those employees would be marked absent. It
            applies from today; earlier days are not changed.
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

// ── Today's marks + approvals ────────────────────────────────────────────
function MarksCard({ say }: { say: (ok: boolean, text: string) => void }) {
  const qc = useQueryClient();
  const isSuperAdmin = useAuthStore((s) => s.user?.role) === "SUPER_ADMIN";
  const [date, setDate] = useState(todayKey());
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
  }, []);
  const { data: marks = [], isLoading } = useQuery<Mark[]>({
    queryKey: ["attendance-marks", date],
    queryFn: () => api.get(`/api/attendance/marks?date=${date}`).then((r) => r.data.data),
    refetchInterval: 60_000,
  });
  const decide = useMutation({
    mutationFn: async ({ mark, decision }: { mark: Mark; decision: "APPROVED" | "REJECTED" }) => {
      const note = window.prompt(
        decision === "REJECTED"
          ? isSuperAdmin
            ? "Reason for rejecting (optional):"
            : "Reason for rejecting (required):"
          : "Note for the employee (optional):",
        "",
      );
      if (note === null) throw new Error("__cancelled__");
      if (decision === "REJECTED" && !note.trim() && !isSuperAdmin) {
        throw new Error("Reason is required to reject.");
      }
      return api.patch(`/api/attendance/marks/${mark._id}/decide`, { decision, note });
    },
    onSuccess: (_r, vars) => {
      say(
        true,
        vars.decision === "APPROVED"
          ? `${vars.mark.employeeName}'s attendance is marked.`
          : `${vars.mark.employeeName}'s request was rejected.`,
      );
      qc.invalidateQueries({ queryKey: ["attendance-marks"] });
    },
    onError: (error: any) => {
      if (error?.message === "__cancelled__") return;
      say(false, errorText(error, "Could not save."));
    },
  });
  const sorted = [...marks].sort(
    (a, b) => Number(b.status === "PENDING_APPROVAL") - Number(a.status === "PENDING_APPROVAL"),
  );

  return (
    <section className={card}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Marks</h2>
          <p className="text-xs text-gray-500">
            Who started their day, when the laptop opened, when they reached a work location, and
            requests to work from elsewhere.
          </p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
      </header>
      {isLoading ? (
        <p className="p-4 text-sm text-gray-500">Loading…</p>
      ) : !sorted.length ? (
        <p className="p-4 text-sm text-gray-500">No one has marked attendance on this day.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Employee</th>
                <th className="px-4 py-2">Laptop opened</th>
                <th className="px-4 py-2">Clicked Mark</th>
                <th className="px-4 py-2">Reached location</th>
                <th className="px-4 py-2">Login</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((mark) => (
                <tr key={mark._id} className="align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{mark.employeeName || mark.employeeId}</div>
                    <div className="text-xs text-gray-400">{mark.employeeId}</div>
                  </td>
                  <td className="px-4 py-2">{clock(mark.laptopOpenAt)}</td>
                  <td className="px-4 py-2">{clock(mark.markedAt)}</td>
                  <td className="px-4 py-2">{clock(mark.locationReachedAt)}</td>
                  <td className="px-4 py-2 font-semibold">{clock(mark.loginTime)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[mark.status].cls}`}>
                      {STATUS[mark.status].label}
                    </span>
                    <div className="mt-1 text-xs text-gray-500">
                      {mark.method ? METHOD[mark.method] || mark.method : ""}
                      {mark.locationName ? ` · ${mark.locationName}` : ""}
                    </div>
                    {mark.remoteReason ? (
                      <div className="mt-1 max-w-xs text-xs text-gray-700">
                        Reason: {mark.remoteReason}
                      </div>
                    ) : null}
                    {mark.remoteDecisionNote ? (
                      <div className="mt-1 text-xs text-indigo-600">Note: {mark.remoteDecisionNote}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {mark.status === "PENDING_APPROVAL" ||
                    (mark.status === "REJECTED" && mark.remoteReason) ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => decide.mutate({ mark, decision: "APPROVED" })}
                          disabled={decide.isPending}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        {mark.status === "PENDING_APPROVAL" ? (
                          <button
                            type="button"
                            onClick={() => decide.mutate({ mark, decision: "REJECTED" })}
                            disabled={decide.isPending}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white"
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </button>
                        ) : null}
                      </div>
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

// ── Work locations ───────────────────────────────────────────────────────
type Draft = {
  _id?: string;
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  wifiNames: string;
  publicIps: string;
  appliesTo: "ALL" | "EMPLOYEES";
  employeeIds: string[];
};
const emptyDraft: Draft = {
  name: "",
  latitude: "",
  longitude: "",
  radiusMeters: "200",
  wifiNames: "",
  publicIps: "",
  appliesTo: "ALL",
  employeeIds: [],
};

function LocationsCard({
  say,
  employees,
}: {
  say: (ok: boolean, text: string) => void;
  employees: Person[];
}) {
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["work-locations", showInactive],
    queryFn: () =>
      api
        .get(`/api/attendance/locations${showInactive ? "?includeInactive=true" : ""}`)
        .then((r) => r.data.data),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [filter, setFilter] = useState("");
  const nameOf = useMemo(() => new Map(employees.map((e) => [e.employeeId, e.name])), [employees]);

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = {
        name: d.name,
        latitude: d.latitude === "" ? null : Number(d.latitude),
        longitude: d.longitude === "" ? null : Number(d.longitude),
        radiusMeters: Number(d.radiusMeters || 200),
        wifiNames: d.wifiNames,
        publicIps: d.publicIps,
        appliesTo: d.appliesTo,
        employeeIds: d.employeeIds,
      };
      return d._id
        ? api.patch(`/api/attendance/locations/${d._id}`, body)
        : api.post("/api/attendance/locations", body);
    },
    onSuccess: () => {
      say(true, "Location saved.");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["work-locations"] });
    },
    onError: (error) => setDraftError(errorText(error, "Could not save the location.")),
  });
  const toggle = useMutation({
    mutationFn: (location: Location) =>
      api.patch(`/api/attendance/locations/${location._id}`, { isActive: !location.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-locations"] }),
    onError: (error) => say(false, errorText(error, "Could not update.")),
  });

  const useMyPosition = () => {
    if (!navigator.geolocation || !draft) {
      setDraftError("This browser cannot read its location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setDraft((d) =>
          d
            ? {
                ...d,
                latitude: pos.coords.latitude.toFixed(6),
                longitude: pos.coords.longitude.toFixed(6),
              }
            : d,
        ),
      () => setDraftError("Location permission was refused in this browser."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  const addMyIp = async () => {
    try {
      const ip = (await api.get("/api/attendance/locations/my-ip")).data.data.ip as string;
      setDraft((d) =>
        d
          ? {
              ...d,
              publicIps: Array.from(
                new Set([...d.publicIps.split(",").map((v) => v.trim()).filter(Boolean), ip]),
              ).join(", "),
            }
          : d,
      );
    } catch {
      setDraftError("Could not read this network's address.");
    }
  };

  return (
    <section className={card}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Work locations</h2>
          <p className="text-xs text-gray-500">
            A location is reached if any one matches: within the radius of the map point, on one of
            the office Wi-Fi networks, or on the office internet connection.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show switched-off
          </label>
          <button
            type="button"
            onClick={() => {
              setDraft({ ...emptyDraft });
              setDraftError("");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" /> Add location
          </button>
        </div>
      </header>

      {draft ? (
        <div className="grid gap-3 border-b border-gray-100 bg-gray-50 p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-xs font-medium text-gray-600 sm:col-span-2">
              <span>Name <span className="text-rose-600">*</span></span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Head office"
                className={input}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-gray-600">
              Latitude
              <input
                value={draft.latitude}
                onChange={(e) => setDraft({ ...draft, latitude: e.target.value })}
                placeholder="28.6139"
                className={input}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-gray-600">
              Longitude
              <input
                value={draft.longitude}
                onChange={(e) => setDraft({ ...draft, longitude: e.target.value })}
                placeholder="77.2090"
                className={input}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-gray-600">
              Radius (meters)
              <input
                type="number"
                min={20}
                max={5000}
                value={draft.radiusMeters}
                onChange={(e) => setDraft({ ...draft, radiusMeters: e.target.value })}
                className={input}
              />
            </label>
            <div className="flex items-end sm:col-span-3">
              <button
                type="button"
                onClick={useMyPosition}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
              >
                <Crosshair className="h-4 w-4" /> Use this computer&apos;s location
              </button>
            </div>
            <label className="grid gap-1 text-xs font-medium text-gray-600 sm:col-span-2">
              Office Wi-Fi names (comma separated)
              <input
                value={draft.wifiNames}
                onChange={(e) => setDraft({ ...draft, wifiNames: e.target.value })}
                placeholder="Prosync-Office, Prosync-5G"
                className={input}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-gray-600 sm:col-span-2">
              <span>
                Office internet addresses (comma separated){" "}
                <button type="button" onClick={addMyIp} className="text-indigo-600 underline">
                  add this network&apos;s
                </button>
              </span>
              <input
                value={draft.publicIps}
                onChange={(e) => setDraft({ ...draft, publicIps: e.target.value })}
                placeholder="203.0.113.10"
                className={input}
              />
            </label>
          </div>
          <div className="inline-flex w-fit rounded-lg bg-gray-100 p-1">
            {(
              [
                ["ALL", "Everyone"],
                ["EMPLOYEES", "Selected people"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDraft({ ...draft, appliesTo: value })}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${draft.appliesTo === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {draft.appliesTo === "EMPLOYEES" ? (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search people…"
                className={`${input} mb-2 w-full`}
              />
              <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {employees
                  .filter((e) => `${e.name} ${e.employeeId}`.toLowerCase().includes(filter.trim().toLowerCase()))
                  .map((employee) => (
                    <label key={employee.employeeId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.employeeIds.includes(employee.employeeId)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            employeeIds: e.target.checked
                              ? [...draft.employeeIds, employee.employeeId]
                              : draft.employeeIds.filter((id) => id !== employee.employeeId),
                          })
                        }
                      />
                      {employee.name}
                    </label>
                  ))}
              </div>
            </div>
          ) : null}
          {draftError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {draftError}
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftError("");
                if (!draft.name.trim()) {
                  setDraftError("Location name is required.");
                  return;
                }
                save.mutate(draft);
              }}
              disabled={save.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save location"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!locations.length ? (
        <p className="p-4 text-sm text-gray-500">No work locations yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {locations.map((location) => (
            <li
              key={location._id}
              className={`flex flex-wrap items-start justify-between gap-2 px-4 py-3 ${location.isActive ? "" : "opacity-50"}`}
            >
              <div className="text-sm">
                <div className="font-semibold text-gray-900">{location.name}</div>
                <div className="text-xs text-gray-500">
                  {location.latitude != null
                    ? `${location.latitude.toFixed(5)}, ${location.longitude?.toFixed(5)} · ${location.radiusMeters} m`
                    : "No map point"}
                  {location.wifiNames.length ? ` · Wi-Fi: ${location.wifiNames.join(", ")}` : ""}
                  {location.publicIps.length ? ` · IP: ${location.publicIps.join(", ")}` : ""}
                </div>
                <div className="text-xs text-gray-500">
                  For:{" "}
                  {location.appliesTo === "ALL"
                    ? "Everyone"
                    : location.employeeIds.map((id) => nameOf.get(id) || id).join(", ")}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraftError("");
                    setDraft({
                      _id: location._id,
                      name: location.name,
                      latitude: location.latitude == null ? "" : String(location.latitude),
                      longitude: location.longitude == null ? "" : String(location.longitude),
                      radiusMeters: String(location.radiusMeters || 200),
                      wifiNames: location.wifiNames.join(", "),
                      publicIps: location.publicIps.join(", "),
                      appliesTo: location.appliesTo,
                      employeeIds: location.employeeIds,
                    });
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggle.mutate(location)}
                  disabled={toggle.isPending}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium"
                >
                  {location.isActive ? "Switch off" : "Switch on"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
