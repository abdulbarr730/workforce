import React from "react";
import { Coffee, Briefcase, Clock, AlertCircle } from "lucide-react";

export const IdleOverlayPage: React.FC = () => {
  const handleResponse = (isWorking: boolean) => {
    if (window.electronAPI && window.electronAPI.sendIdleResponse) {
      window.electronAPI.sendIdleResponse(isWorking);
    } else {
      console.warn("Electron API not available, simulating close.");
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-50 flex items-center justify-center p-6 select-none overflow-hidden text-gray-900 border border-gray-200 rounded-xl shadow-2xl" style={{ WebkitAppRegion: 'drag' } as any}>
      <div 
        className="w-full h-full flex flex-col items-center justify-center text-center"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mb-4 border border-orange-200 shadow-sm">
          <Clock className="w-7 h-7 text-orange-600" />
        </div>
        
        <h1 className="text-xl font-bold text-gray-900 mb-2">You've been away</h1>
        <p className="text-gray-600 mb-6 text-sm max-w-sm px-4">
          We haven't detected any activity on this device. Were you working away from your computer?
        </p>

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
        
        <div className="mt-5 flex items-center gap-1.5 text-xs text-gray-400 font-medium">
          <AlertCircle className="w-3.5 h-3.5" />
          Please select an option to resume tracking
        </div>
      </div>
    </div>
  );
};
