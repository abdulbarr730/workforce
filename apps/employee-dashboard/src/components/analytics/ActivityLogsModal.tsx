"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, Clock, Quote } from "lucide-react";
import { formatTime } from "@/lib/utils";

interface ActivityLogsModalProps {
  type: "BREAK" | "OFFLINE" | null;
  date: string;
  onClose: () => void;
}

export function ActivityLogsModal({ type, date, onClose }: ActivityLogsModalProps) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["activity-logs", date],
    queryFn: () => api.get(`/api/me/analytics/logs?date=${date}`).then((r) => r.data.data),
    enabled: !!type,
  });

  if (!type) return null;

  const title = type === "BREAK" ? "Break Time Logs" : "Offline Work Logs";
  
  // Combine OFFLINE and IDLE_OFFLINE for the offline work view
  const filteredLogs = logs?.filter((log: any) => 
    type === "BREAK" ? log.type === "BREAK" : (log.type === "OFFLINE" || log.type === "IDLE_OFFLINE")
  ) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex space-x-4">
                  <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No {type === "BREAK" ? "breaks" : "offline work"} recorded for today.</p>
            </div>
          ) : (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              {filteredLogs.map((log: any, index: number) => (
                <div key={index} className="relative flex items-start space-x-4">
                  <div className="absolute left-0 md:left-1/2 -ml-1.5 md:-ml-1.5 mt-1.5 w-3 h-3 bg-indigo-500 rounded-full ring-4 ring-white shadow-sm z-10"></div>
                  
                  <div className="ml-8 md:ml-0 md:w-1/2 md:pr-8 md:text-right">
                    <span className="text-sm font-semibold text-gray-900 block">
                      {formatTime(log.start)} - {formatTime(log.end)}
                    </span>
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full inline-block mt-1">
                      {log.durationMinutes} mins
                    </span>
                  </div>
                  
                  <div className="ml-8 md:ml-0 md:w-1/2 md:pl-8 pt-1">
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm text-gray-700 shadow-sm relative">
                      <Quote className="w-4 h-4 text-gray-300 absolute -top-2 -left-2 bg-white" />
                      {log.reason || (type === "BREAK" ? "Taking a break" : "Working offline")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
