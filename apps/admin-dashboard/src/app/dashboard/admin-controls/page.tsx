"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Brain, Cpu, Database, Gauge, Mail, RefreshCw, Search, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { apiErrorMessage } from "@/components/auth/SetPasswordForm";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type Totals = { calls: number; inputTokens: number; outputTokens: number; costUsd: number; failed: number };
type Overview = {
  generatedAt: string;
  server: {
    hostname: string;
    platform: string;
    cpuCount: number;
    cpuModel: string | null;
    loadAverage: number[];
    memory: { total: number; free: number };
    disk: { total: number; free: number } | null;
    uptimeSeconds: number;
    node: string;
    api: { uptimeSeconds: number; memory: { rss: number; heapUsed: number }; env: string };
  };
  database: {
    connected: boolean;
    name?: string;
    version?: string | null;
    uptimeSeconds?: number | null;
    connections?: { current?: number; available?: number } | null;
    dataSize?: number | null;
    storageSize?: number | null;
    indexSize?: number | null;
    objects?: number | null;
    collections?: Array<{ name: string; count: number; size: number; storageSize: number; indexSize: number }>;
    error?: string;
  };
  email: {
    configured: boolean;
    provider: string;
    fromAddress: string | null;
    totals: Record<string, number>;
    byCategory: Record<string, number>;
    peopleEmailed: number;
    last30Days: { sent: number; people: number; costUsd: number };
    costPer1000Usd: number;
    estimatedCostUsd: number;
  };
  ai: {
    configured: boolean;
    model: string;
    pricesPerMTok: { input: number; output: number };
    customPrices: boolean;
    allTime: Totals;
    last30Days: Totals;
    byFeature: Array<Totals & { feature: string }>;
    byModel: Array<Totals & { model: string }>;
    byDay: Array<Totals & { date: string }>;
    trackedSince: string | null;
  };
  brain: { appKnowledge: number; memories: number; lastUpdatedAt: string | null } | null;
};

type EmailLogRow = {
  _id: string;
  to: string;
  toName?: string | null;
  subject: string;
  category: string;
  status: "SENT" | "FAILED" | "NOT_CONFIGURED";
  error?: string | null;
  sentByName?: string | null;
  createdAt: string;
};

const bytes = (n?: number | null) => {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};
const duration = (s?: number | null) => {
  if (s == null) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
const usd = (n?: number) => `$${(n || 0).toFixed((n || 0) < 1 ? 4 : 2)}`;
const num = (n?: number | null) => (n == null ? "—" : n.toLocaleString("en-IN"));
const when = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
const CATEGORY: Record<string, string> = {
  WELCOME: "Welcome / login details",
  PASSWORD_RESET: "Password reset",
  PASSWORD_REMINDER: "Password reminder",
  ATTENDANCE_UPDATED: "Attendance updated",
  LEAVE_DECIDED: "Leave decision",
  CORRECTION_DECIDED: "Correction decision",
  REMOTE_START_DECIDED: "Work-from-elsewhere decision",
  TEST: "Test email",
};
const FEATURE: Record<string, string> = {
  "eod-suggestion": "EOD suggestions",
  "employee-audit": "Employee AI audit",
  "report-analysis": "Report analysis",
  "app-classifier": "App classifier (Brain)",
  "workforce-brain": "Workforce Brain",
  other: "Other",
};

const card = "rounded-xl border border-gray-200 bg-white";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{value}</p>
      {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

function Bar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct > 85 ? "bg-rose-500" : pct > 65 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AdminControlsPage() {
  const [tab, setTab] = useState<"overview" | "emails">("overview");
  const [fresh, setFresh] = useState(0);
  const { data, isLoading, isFetching, refetch } = useQuery<Overview>({
    queryKey: ["system-overview", fresh],
    queryFn: () => api.get(`/api/system/overview${fresh ? "?fresh=1" : ""}`).then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            <Gauge className="h-4 w-4" /> Admin Controls
          </div>
          <h1 className="mt-3 text-2xl font-black text-slate-950">System & costs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Server, database, emails sent and AI cost. Updated {when(data?.generatedAt)}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            {(["overview", "emails"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? "bg-white font-semibold shadow-sm" : "text-gray-600"}`}
              >
                {t === "overview" ? "Overview" : "Email log"}
              </button>
            ))}
          </div>
          {tab === "overview" && (
            <button
              onClick={() => {
                setFresh((f) => f + 1);
                void refetch();
              }}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </button>
          )}
        </div>
      </header>

      {tab === "emails" ? (
        <>
          <EmailSendersPanel />
          <EmailLogPanel />
        </>
      ) : isLoading || !data ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Server */}
            <section className={`${card} p-5`}>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
                <Cpu className="h-4 w-4 text-indigo-600" /> VPS / server
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Stat label="CPU" value={`${data.server.cpuCount} cores`} hint={data.server.cpuModel || undefined} />
                <Stat
                  label="Load (1 / 5 / 15 min)"
                  value={data.server.loadAverage.map((l) => l.toFixed(2)).join(" · ")}
                  hint={`${Math.round((data.server.loadAverage[0] / Math.max(1, data.server.cpuCount)) * 100)}% of CPU`}
                />
                <Stat label="Server up" value={duration(data.server.uptimeSeconds)} hint={data.server.platform} />
                <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Memory</p>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">
                    {bytes(data.server.memory.total - data.server.memory.free)} / {bytes(data.server.memory.total)}
                  </p>
                  <Bar used={data.server.memory.total - data.server.memory.free} total={data.server.memory.total} />
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Disk</p>
                  {data.server.disk ? (
                    <>
                      <p className="mt-0.5 text-sm font-bold text-gray-900">
                        {bytes(data.server.disk.total - data.server.disk.free)} / {bytes(data.server.disk.total)}
                      </p>
                      <Bar used={data.server.disk.total - data.server.disk.free} total={data.server.disk.total} />
                    </>
                  ) : (
                    <p className="mt-0.5 text-sm text-gray-500">Not available</p>
                  )}
                </div>
                <Stat
                  label="API process"
                  value={bytes(data.server.api.memory.rss)}
                  hint={`up ${duration(data.server.api.uptimeSeconds)} · Node ${data.server.node}`}
                />
              </div>
            </section>

            {/* Database */}
            <section className={`${card} p-5`}>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
                <Database className="h-4 w-4 text-indigo-600" /> Database
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    data.database.connected ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {data.database.connected ? "Connected" : "Not connected"}
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Stat label="Data" value={bytes(data.database.dataSize)} hint={`${num(data.database.objects)} records`} />
                <Stat label="On disk" value={bytes(data.database.storageSize)} hint={`indexes ${bytes(data.database.indexSize)}`} />
                <Stat
                  label="MongoDB"
                  value={data.database.version ? `v${data.database.version}` : "—"}
                  hint={`up ${duration(data.database.uptimeSeconds)} · ${num(data.database.connections?.current)} connections`}
                />
              </div>
              <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-1.5">Collection</th>
                      <th className="px-3 py-1.5 text-right">Records</th>
                      <th className="px-3 py-1.5 text-right">Size</th>
                      <th className="px-3 py-1.5 text-right">Indexes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.database.collections || []).map((c) => (
                      <tr key={c.name} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 font-medium text-gray-800">{c.name}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{num(c.count)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{bytes(c.size)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{bytes(c.indexSize)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Emails */}
            <section className={`${card} p-5`}>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
                <Mail className="h-4 w-4 text-indigo-600" /> Emails ({data.email.provider})
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    data.email.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {data.email.configured ? `Sending from ${data.email.fromAddress}` : "Not set up"}
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Sent" value={num(data.email.totals.SENT || 0)} hint={`to ${num(data.email.peopleEmailed)} people`} />
                <Stat label="Last 30 days" value={num(data.email.last30Days.sent)} hint={`to ${num(data.email.last30Days.people)} people`} />
                <Stat label="Failed" value={num(data.email.totals.FAILED || 0)} hint={`${num(data.email.totals.NOT_CONFIGURED || 0)} not sent (not set up)`} />
                <Stat
                  label="Cost (estimate)"
                  value={usd(data.email.estimatedCostUsd)}
                  hint={`30 days ${usd(data.email.last30Days.costUsd)} · $${data.email.costPer1000Usd}/1,000`}
                />
              </div>
              <div className="mt-4 space-y-1.5">
                {Object.entries(data.email.byCategory).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{CATEGORY[k] || k}</span>
                    <span className="font-semibold text-gray-900">{num(v)}</span>
                  </div>
                ))}
                {Object.keys(data.email.byCategory).length === 0 && <p className="text-sm text-gray-400">No emails sent yet.</p>}
              </div>
              <button onClick={() => setTab("emails")} className="mt-3 text-xs font-medium text-indigo-600 hover:underline">
                See every email →
              </button>
            </section>

            {/* AI */}
            <section className={`${card} p-5`}>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
                <Sparkles className="h-4 w-4 text-indigo-600" /> AI models cost
                <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{data.ai.model}</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Last 30 days" value={usd(data.ai.last30Days.costUsd)} hint={`${num(data.ai.last30Days.calls)} requests`} />
                <Stat label="All time" value={usd(data.ai.allTime.costUsd)} hint={`since ${when(data.ai.trackedSince)}`} />
                <Stat
                  label="Tokens (30 days)"
                  value={num(data.ai.last30Days.inputTokens + data.ai.last30Days.outputTokens)}
                  hint={`${num(data.ai.last30Days.inputTokens)} in · ${num(data.ai.last30Days.outputTokens)} out`}
                />
                <Stat
                  label="Price / 1M tokens"
                  value={`$${data.ai.pricesPerMTok.input} / $${data.ai.pricesPerMTok.output}`}
                  hint={data.ai.customPrices ? "your prices" : "estimate (in / out)"}
                />
              </div>
              <div className="mt-4 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">By feature (30 days)</p>
                {data.ai.byFeature.map((f) => (
                  <div key={f.feature} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {FEATURE[f.feature] || f.feature}
                      <span className="ml-1 text-xs text-gray-400">({num(f.calls)} requests{f.failed ? `, ${f.failed} failed` : ""})</span>
                    </span>
                    <span className="font-semibold text-gray-900">{usd(f.costUsd)}</span>
                  </div>
                ))}
                {data.ai.byFeature.length === 0 && (
                  <p className="text-sm text-gray-400">
                    {data.ai.configured ? "No AI requests in the last 30 days." : "AI is not set up on the server."}
                  </p>
                )}
              </div>
              {data.ai.byDay.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Last 14 days</p>
                  <div className="flex h-16 items-end gap-1">
                    {data.ai.byDay.map((d) => {
                      const max = Math.max(...data.ai.byDay.map((x) => x.costUsd), 0.000001);
                      return (
                        <div
                          key={d.date}
                          title={`${d.date}: ${usd(d.costUsd)} (${d.calls} requests)`}
                          className="flex-1 rounded-t bg-indigo-400"
                          style={{ height: `${Math.max(4, (d.costUsd / max) * 100)}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Brain */}
          {data.brain && (
            <section className={`${card} flex flex-wrap items-center gap-6 p-5`}>
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <Brain className="h-4 w-4 text-indigo-600" /> Workforce Brain
              </h2>
              <span className="text-sm text-gray-600">
                <b className="text-gray-900">{num(data.brain.appKnowledge)}</b> apps learned
              </span>
              <span className="text-sm text-gray-600">
                <b className="text-gray-900">{num(data.brain.memories)}</b> memories
              </span>
              <span className="text-sm text-gray-600">last updated {when(data.brain.lastUpdatedAt)}</span>
              <Link href="/dashboard/workforce-brain" className="ml-auto text-sm font-medium text-indigo-600 hover:underline">
                Open the Brain →
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EmailLogPanel() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery<{
    configured: boolean;
    totals: Record<string, number>;
    peopleEmailed: number;
    logs: EmailLogRow[];
  }>({
    queryKey: ["email-logs", status, category, search],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "300" });
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (search.trim()) params.set("search", search.trim());
      return api.get(`/api/notifications/email-logs?${params}`).then((r) => r.data.data);
    },
  });

  return (
    <section className={card}>
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search person or subject"
            className="rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
          <option value="NOT_CONFIGURED">Not sent (email not set up)</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">All types</option>
          {Object.entries(CATEGORY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {data && (
          <span className="ml-auto text-xs text-gray-500">
            {num(data.totals.SENT || 0)} sent to {num(data.peopleEmailed)} people · {num(data.totals.FAILED || 0)} failed
          </span>
        )}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">To</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Sent by</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {data?.logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No emails match.
                </td>
              </tr>
            )}
            {data?.logs.map((log) => (
              <tr key={log._id} className="border-b border-gray-50 align-top">
                <td className="whitespace-nowrap px-4 py-2 text-gray-600">{when(log.createdAt)}</td>
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-900">{log.toName || log.to}</p>
                  {log.toName && <p className="text-xs text-gray-500">{log.to}</p>}
                </td>
                <td className="px-4 py-2 text-gray-700">{log.subject}</td>
                <td className="px-4 py-2 text-gray-600">{CATEGORY[log.category] || log.category}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      log.status === "SENT"
                        ? "bg-emerald-50 text-emerald-700"
                        : log.status === "FAILED"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                    title={log.error || undefined}
                  >
                    {log.status === "SENT" ? "Sent" : log.status === "FAILED" ? "Failed" : "Not sent"}
                  </span>
                  {log.error && <p className="mt-1 max-w-xs truncate text-[11px] text-gray-400">{log.error}</p>}
                </td>
                <td className="px-4 py-2 text-gray-600">{log.sentByName || "Automatic"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type SenderGroupRow = {
  key: string;
  label: string;
  description: string;
  example: string;
  suggestedName: string;
  address: string;
  name: string;
  replyTo: string;
  using: { address: string | null; name: string };
};

function EmailSendersPanel() {
  const access = useAccess();
  const canEdit = Boolean(access?.superAdmin);
  const qc = useQueryClient();
  const { data } = useQuery<{
    configured: boolean;
    defaultSender: { address: string | null; name: string };
    groups: SenderGroupRow[];
  }>({
    queryKey: ["email-settings"],
    queryFn: () => api.get("/api/notifications/email-settings").then((r) => r.data.data),
  });
  const [draft, setDraft] = useState<Record<string, { address: string; name: string; replyTo: string }>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const value = (g: SenderGroupRow) => draft[g.key] || { address: g.address, name: g.name, replyTo: g.replyTo };
  const setField = (g: SenderGroupRow, field: "address" | "name" | "replyTo", v: string) =>
    setDraft((d) => ({ ...d, [g.key]: { ...value(g), [field]: v } }));

  const save = useMutation({
    mutationFn: () =>
      api.put("/api/notifications/email-settings", {
        senders: (data?.groups || []).map((g) => ({ group: g.key, ...value(g) })),
      }),
    onSuccess: (res: any) => {
      setNotice({ ok: !res?.data?.data?.warnings?.length, text: res?.data?.message || "Saved." });
      setDraft({});
      qc.invalidateQueries({ queryKey: ["email-settings"] });
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err, "Could not save.") }),
  });
  const test = useMutation({
    mutationFn: (group: string) => api.post("/api/notifications/email-settings/test", { group }),
    onSuccess: (res: any) => {
      setNotice({ ok: res?.data?.data?.status === "SENT", text: res?.data?.message || "Done." });
      qc.invalidateQueries({ queryKey: ["email-logs"] });
    },
    onError: (err) => setNotice({ ok: false, text: apiErrorMessage(err, "Could not send the test email.") }),
  });

  const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50";
  return (
    <section className={`${card} mb-6 p-5`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Mail className="h-4 w-4 text-indigo-600" /> Email senders
          </h2>
          <p className="text-xs text-gray-500">
            Who each type of email comes from. Addresses must be on a domain verified in ZeptoMail. Empty = the
            server default ({data?.defaultSender.address || "not set"}).
          </p>
        </div>
        {data && !data.configured && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            Email not set up on the server yet
          </span>
        )}
      </div>
      <div className="space-y-4">
        {(data?.groups || []).map((g) => {
          const v = value(g);
          return (
            <div key={g.key} className="rounded-lg border border-gray-100 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{g.label}</p>
                  <p className="text-xs text-gray-500">{g.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500">
                    Sending as {g.using.name} &lt;{g.using.address || "—"}&gt;
                  </span>
                  <button
                    onClick={() => test.mutate(g.key)}
                    disabled={test.isPending}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
                  >
                    Send me a test
                  </button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  className={inputCls}
                  disabled={!canEdit}
                  placeholder={`From address, e.g. ${g.example}yourdomain.com`}
                  value={v.address}
                  onChange={(e) => setField(g, "address", e.target.value)}
                />
                <input
                  className={inputCls}
                  disabled={!canEdit}
                  placeholder={`Sender name, e.g. ${g.suggestedName}`}
                  value={v.name}
                  onChange={(e) => setField(g, "name", e.target.value)}
                />
                <input
                  className={inputCls}
                  disabled={!canEdit}
                  placeholder="Replies go to (optional)"
                  value={v.replyTo}
                  onChange={(e) => setField(g, "replyTo", e.target.value)}
                />
              </div>
            </div>
          );
        })}
      </div>
      {notice && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {notice.text}
        </div>
      )}
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || Object.keys(draft).length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save senders"}
          </button>
        </div>
      )}
    </section>
  );
}
