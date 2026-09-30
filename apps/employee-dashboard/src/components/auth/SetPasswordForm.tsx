"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Same rule as the server: 8+ characters with letters and numbers. */
export const passwordProblem = (password: string) => {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Use both letters and numbers.";
  return null;
};

export const apiErrorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ||
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  fallback;

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  fontSize: 13,
  background: "#fff",
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#334155",
  marginBottom: 5,
};

/**
 * New password + confirmation (and optionally the current password).
 * `onSubmit` does the API call and throws on failure.
 */
export function SetPasswordForm({
  askCurrent = false,
  submitLabel = "Set password",
  onSubmit,
  onCancel,
  cancelLabel = "Cancel",
}: {
  askCurrent?: boolean;
  submitLabel?: string;
  onSubmit: (values: { newPassword: string; currentPassword?: string }) => Promise<void>;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (askCurrent && !current) return setError("Enter your current password.");
    const problem = passwordProblem(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError("The two passwords don't match.");
    setSaving(true);
    try {
      await onSubmit({ newPassword: next, currentPassword: askCurrent ? current : undefined });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not set the password. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {askCurrent && (
        <div>
          <label style={labelStyle}>Current password</label>
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            style={inputStyle}
          />
        </div>
      )}
      <div>
        <label style={labelStyle}>New password</label>
        <input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="8+ characters, letters and numbers"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Type it again</label>
        <input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={inputStyle}
        />
      </div>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        style={{
          alignSelf: "flex-start",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: "#64748b",
          fontSize: 12,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {show ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
        {show ? "Hide passwords" : "Show passwords"}
      </button>
      {error && (
        <div
          style={{
            padding: "9px 12px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            fontSize: 12,
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={saving}
        style={{
          height: 38,
          background: saving ? "#FFB84D" : "linear-gradient(135deg,#FF9900,#E68A00)",
          color: "#111827",
          border: "none",
          borderRadius: 9,
          fontSize: 13,
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer" }}
        >
          {cancelLabel}
        </button>
      )}
    </form>
  );
}
