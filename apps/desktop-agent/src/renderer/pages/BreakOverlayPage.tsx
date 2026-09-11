import React, { useEffect, useMemo, useState } from "react";
import { Coffee, TimerReset } from "lucide-react";

type BreakState = {
  isOnBreak: boolean;
  startedAt: string | null;
  endsAt: string | null;
  scheduleId: string | null;
  plannedDurationMinutes?: number | null;
  priorBreakSeconds?: number;
  isHalfDay?: boolean;
  message: string;
  reasonOptions?: string[];
  requireReasonOnReturn?: boolean;
};

function formatRemaining(endsAt?: string | null) {
  if (!endsAt) return "Open break";
  const diff = new Date(endsAt).getTime() - Date.now();
  const seconds = Math.abs(Math.round(diff / 1000));
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const label = hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return diff < 0 ? `-${label}` : label;
}

function formatBalance(seconds: number) {
  const abs = Math.abs(Math.round(seconds));
  const mins = Math.floor(abs / 60);
  const secs = abs % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export const BreakOverlayPage: React.FC = () => {
  const [state, setState] = useState<BreakState | null>(null);
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    window.electronAPI?.getBreakState?.().then(setState);
    window.electronAPI?.onBreakStateChanged?.((next) => {
      if (next) setState(next);
    });
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = useMemo(() => formatRemaining(state?.endsAt), [state, tick]);
  const allowanceSeconds = Math.max(
    0,
    Math.round(Number(state?.plannedDurationMinutes || 0) * 60),
  );
  const usedBeforeSeconds = Math.max(
    0,
    Math.round(Number(state?.priorBreakSeconds || 0)),
  );
  const balanceAtStartSeconds = allowanceSeconds - usedBeforeSeconds;
  const reasonOptions = state?.reasonOptions || [];
  const requiresReason = Boolean(state?.requireReasonOnReturn);
  const isOtherSelected = /^others?$/i.test(reason.trim());
  const finalReason = isOtherSelected ? otherReason.trim() : reason.trim();
  const stopBreak = () => {
    if (requiresReason && !finalReason) {
      setError("Please select why this break ended.");
      return;
    }
    if (isOtherSelected && !otherReason.trim()) {
      setError("Please write the other reason.");
      return;
    }
    void window.electronAPI?.stopBreak?.({ reason: finalReason });
  };

  return (
    <div
      className="flex h-screen w-screen select-none items-center justify-center overflow-hidden bg-gray-900/80 p-6 backdrop-blur-md"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      <div
        className="flex w-full max-w-md flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-2xl"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-orange-200 bg-orange-100 shadow-sm">
          <Coffee className="h-8 w-8 text-orange-600" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          You are on break
        </h1>
        <div className="mt-2 rounded-xl bg-orange-50 px-5 py-3 text-5xl font-black tabular-nums text-orange-700">
          {remaining}
        </div>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
          {remaining.includes(":") && remaining.replace("-", "").split(":").length === 3
            ? "hours : minutes : seconds"
            : "minutes : seconds"}
        </p>
        {remaining.startsWith("-") && (
          <p className="mt-3 rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-600">
            You are in minus break time.
          </p>
        )}
        {state?.isHalfDay && allowanceSeconds > 0 && (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">
            You are on half day today. Your break allowance is{" "}
            {Math.round(allowanceSeconds / 60)} minutes.
            <br />
            {balanceAtStartSeconds >= 0
              ? `Break remaining when you started: ${formatBalance(balanceAtStartSeconds)}.`
              : `You had already exceeded break by ${formatBalance(balanceAtStartSeconds)} when this break started.`}
          </div>
        )}
        <p className="mx-auto mt-4 max-w-md px-4 text-sm text-gray-600">
          {state?.message ||
            "Recharge for a bit. Idle popups are muted while your break timer is running."}
        </p>
        {(reasonOptions.length > 0 || requiresReason) && (
          <div className="mt-6 w-full px-2 text-left">
            <label className="text-xs font-bold uppercase tracking-[0.15em] text-gray-500">
              Return reason {requiresReason ? "(required)" : "(optional)"}
            </label>
            {reasonOptions.length > 0 ? (
              <select
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setOtherReason("");
                  setError("");
                }}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select reason</option>
                {reasonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : null}
            {(isOtherSelected || reasonOptions.length === 0) && (
              <input
                value={otherReason}
                onChange={(event) => {
                  setOtherReason(event.target.value);
                  setError("");
                }}
                placeholder="Write reason"
                className="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            )}
            {error && (
              <p className="mt-2 text-xs font-bold text-red-500">{error}</p>
            )}
          </div>
        )}
        <button
          onClick={stopBreak}
          className="mt-8 inline-flex items-center gap-2 rounded-lg border border-blue-700 bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
        >
          <TimerReset className="h-5 w-5" />
          I’m back — stop break
        </button>
      </div>
    </div>
  );
};
