"use client";
import { AlarmClock, LogOut, Coffee } from "lucide-react";

export function TimeUpModal({
  shiftEndTime,
  onWorkMore,
  onLogout,
}: {
  shiftEndTime?: string;
  onWorkMore: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div
          className="p-6 text-white text-center"
          style={{ background: "linear-gradient(120deg,#9f1239,#dc2626)" }}
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-white/15 flex items-center justify-center mb-3 animate-pulse">
            <AlarmClock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">Your shift has ended</h2>
          <p className="text-sm text-rose-100 mt-1">
            {shiftEndTime
              ? `Scheduled end: ${shiftEndTime}`
              : "Time to wrap up"}
          </p>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm text-gray-700 mb-5">
            Submit your end-of-day report to sign out, or continue working if
            you need more time.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={onLogout}
              className="w-full px-4 py-3 rounded-lg text-white font-semibold inline-flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(180deg,#f59e0b,#b45309)" }}
            >
              <LogOut className="w-4 h-4" />
              Submit EOD &amp; log out
            </button>
            <button
              onClick={onWorkMore}
              className="w-full px-4 py-3 rounded-lg font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 inline-flex items-center justify-center gap-2"
            >
              <Coffee className="w-4 h-4" />
              Keep working
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-4">
            If you keep working, we&apos;ll log overtime against your shift
            policy.
          </p>
        </div>
      </div>
    </div>
  );
}
