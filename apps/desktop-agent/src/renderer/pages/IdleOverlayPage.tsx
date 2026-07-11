import React, { useState } from "react";
import { Coffee, Briefcase, Clock, AlertCircle } from "lucide-react";

export const IdleOverlayPage: React.FC = () => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const handleResponse = (isWorking: boolean) => {
    if (isWorking && !reason.trim()) {
      setError("Please describe what you were working on.");
      return;
    }
    setError("");

    if (window.electronAPI && window.electronAPI.sendIdleResponse) {
      window.electronAPI.sendIdleResponse(
        isWorking,
        reason.trim() || undefined,
      );
    } else {
      console.warn("Electron API not available, simulating close.");
    }
  };

  return (
    <div
      className="h-screen w-screen bg-gray-900/80 backdrop-blur-md flex items-center justify-center p-6 select-none overflow-hidden"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center justify-center text-center border border-gray-200"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-4 border border-orange-200 shadow-sm">
          <Clock className="w-8 h-8 text-orange-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          You've been away
        </h1>
        <p className="text-gray-600 mb-6 text-sm px-4">
          We haven't detected any activity on this device. Were you working away
          from your computer?
        </p>

        <div className="w-full px-2 mb-4">
          <input
            type="text"
            placeholder="What were you doing? (Required if working)"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (e.target.value.trim() && error) setError("");
            }}
            className={`w-full px-3 py-2 border rounded-md text-sm shadow-sm focus:outline-none focus:ring-2 ${error ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"}`}
          />
          {error && (
            <p className="text-red-500 text-xs text-left mt-1.5">{error}</p>
          )}
        </div>

        <div className="flex w-full gap-3 px-2">
          <button
            onClick={() => handleResponse(true)}
            className="flex-1 flex flex-col items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-2 rounded-lg transition-all shadow-sm border border-blue-700"
          >
            <Briefcase className="w-5 h-5" />
            <span className="text-sm">Yes, I was working</span>
          </button>

          <button
            onClick={() => handleResponse(false)}
            className="flex-1 flex flex-col items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-2 rounded-lg transition-all shadow-sm border border-gray-300"
          >
            <Coffee className="w-5 h-5 text-gray-500" />
            <span className="text-sm">No, I was on break</span>
          </button>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-400 font-medium">
          <AlertCircle className="w-3.5 h-3.5" />
          Please select an option to resume tracking
        </div>
      </div>
    </div>
  );
};
