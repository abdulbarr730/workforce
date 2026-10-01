"use client";
import { useState } from "react";
import { KeyRound, Link2, Mail, X } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage, passwordProblem } from "@/components/auth/SetPasswordForm";

type Target = { _id: string; name: string; email: string };
type Mode = "one-time" | "set" | "link";

/**
 * Password tools for one person:
 * - email a new one-time password,
 * - type a password (one-time or permanent, emailed or not),
 * - email a "set your password" link.
 */
export function PasswordActionsModal({ target, onClose }: { target: Target; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("one-time");
  const [password, setPassword] = useState("");
  const [requireChange, setRequireChange] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setResult(null);
    if (mode === "set") {
      const problem = passwordProblem(password);
      if (problem) return setResult({ ok: false, text: problem });
    }
    setBusy(true);
    try {
      const res =
        mode === "one-time"
          ? await api.post(`/api/users/${target._id}/send-login-details`)
          : mode === "link"
            ? await api.post(`/api/users/${target._id}/send-reset-link`)
            : await api.post(`/api/users/${target._id}/set-password`, { password, requireChange, sendEmail });
      const status = res.data?.data?.emailStatus;
      setResult({ ok: status == null || status === "SENT", text: res.data?.message || "Done." });
      if (mode === "set") setPassword("");
    } catch (err) {
      setResult({ ok: false, text: apiErrorMessage(err, "Something went wrong. Please try again.") });
    } finally {
      setBusy(false);
    }
  }

  const options: Array<{ id: Mode; icon: typeof Mail; title: string; text: string }> = [
    {
      id: "one-time",
      icon: Mail,
      title: "Email a new one-time password",
      text: "Their old password stops working. They choose their own at next sign-in (agent or dashboard).",
    },
    {
      id: "set",
      icon: KeyRound,
      title: "Set a password",
      text: "Type the password yourself. Make it one-time or permanent, and email it or not.",
    },
    {
      id: "link",
      icon: Link2,
      title: "Email a “set your password” link",
      text: "Works once, for 72 hours. Their current password keeps working until they use it.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Password — {target.name}</h3>
            <p className="text-xs text-gray-500">{target.email}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          {options.map(({ id, icon: Icon, title, text }) => (
            <label
              key={id}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                mode === id ? "border-indigo-400 bg-indigo-50/50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="password-mode"
                checked={mode === id}
                onChange={() => {
                  setMode(id);
                  setResult(null);
                }}
                className="mt-1"
              />
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <Icon className="h-3.5 w-3.5 text-indigo-600" /> {title}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">{text}</p>
              </div>
            </label>
          ))}

          {mode === "set" && (
            <div className="space-y-2 rounded-lg border border-gray-200 p-3">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password (8+ characters, letters and numbers)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={requireChange} onChange={(e) => setRequireChange(e.target.checked)} />
                Ask them to choose their own at next sign-in
              </label>
              <p className="pl-5 text-[11px] text-gray-500">
                {requireChange
                  ? "One-time: works once, expires in 7 days (one reminder is emailed 24 hours before)."
                  : "Permanent: they keep using this password and won't be asked to change it."}
              </p>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                Send email with the new password
              </label>
            </div>
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

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
            Close
          </button>
          <button
            onClick={run}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Working…" : mode === "set" ? "Save password" : "Send email"}
          </button>
        </div>
      </div>
    </div>
  );
}
