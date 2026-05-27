import React from "react";
import { Coffee, Briefcase } from "lucide-react";

export const IdleOverlayPage: React.FC = () => {
  const handleResponse = (isWorking: boolean) => {
    if (window.electronAPI && window.electronAPI.sendIdleResponse) {
      window.electronAPI.sendIdleResponse(isWorking);
    } else {
      console.warn("Electron API not available, simulating close.");
    }
  };

  return (
    <div className="h-screen w-screen bg-black/80 flex items-center justify-center p-6 select-none overflow-hidden" style={{ WebkitAppRegion: 'drag' } as any}>
      <div 
        className="bg-[#1A222C] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center backdrop-blur-xl"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <div className="w-16 h-16 rounded-full bg-[#FF9900]/20 flex items-center justify-center mb-6">
          <Coffee className="w-8 h-8 text-[#FF9900]" />
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">You appear to be idle.</h1>
        <p className="text-gray-400 mb-8 text-sm">
          We haven't detected any mouse or keyboard activity. Were you working away from your computer?
        </p>

        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={() => handleResponse(true)}
            className="flex items-center justify-center gap-2 bg-[#FF9900] hover:bg-[#E68A00] text-black font-semibold py-3 px-4 rounded-xl transition-all"
          >
            <Briefcase className="w-4 h-4" />
            Yes, I was working
          </button>
          
          <button
            onClick={() => handleResponse(false)}
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium py-3 px-4 rounded-xl transition-all border border-white/10"
          >
            <Coffee className="w-4 h-4" />
            No, I was on break
          </button>
        </div>
      </div>
    </div>
  );
};
