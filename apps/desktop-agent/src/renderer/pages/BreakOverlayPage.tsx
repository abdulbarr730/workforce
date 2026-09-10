import React, { useEffect, useMemo, useState } from "react";
import { Coffee, TimerReset } from "lucide-react";

type BreakState = {
  isOnBreak: boolean;
  startedAt: string | null;
  endsAt: string | null;
  scheduleId: string | null;
  message: string;
};

function formatRemaining(endsAt?: string | null) {
  if (!endsAt) return "Open break";
  const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const BreakOverlayPage: React.FC = () => {
  const [state, setState] = useState<BreakState | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    window.electronAPI?.getBreakState?.().then(setState);
    window.electronAPI?.onBreakStateChanged?.((next) => {
      if (next) setState(next);
    });
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = useMemo(() => formatRemaining(state?.endsAt), [state]);

  return (
    <div className="flex h-screen w-screen select-none items-center justify-center overflow-hidden bg-gradient-to-br from-amber-950 via-slate-950 to-indigo-950 p-8 text-white">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-300 text-amber-950 shadow-lg">
          <Coffee className="h-10 w-10" />
        </div>
        <p className="text-sm font-bold uppercase tracking-[0.35em] text-amber-200">
          You are on break
        </p>
        <h1 className="mt-3 text-5xl font-black tabular-nums">{remaining}</h1>
        <p className="mx-auto mt-4 max-w-md text-base text-amber-50/85">
          {state?.message ||
            "Recharge for a bit. Idle popups are muted while your break timer is running."}
        </p>
        <button
          onClick={() => window.electronAPI?.stopBreak?.()}
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:scale-105"
        >
          <TimerReset className="h-5 w-5" />
          I’m back — stop break
        </button>
      </div>
    </div>
  );
};
