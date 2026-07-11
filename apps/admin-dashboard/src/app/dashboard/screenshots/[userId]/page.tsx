"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";
import { Calendar, MonitorPlay } from "lucide-react";

export default function ScreenshotsPage() {
  const { userId } = useParams();
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  const { data, isLoading, error } = useQuery({
    queryKey: ["screenshots", userId, date],
    queryFn: async () => {
      const res = await api.get(`/api/screenshots/${userId}?date=${date}`);
      return res.data;
    },
  });

  const screenshots = data?.screenshots || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Employee Screenshots
          </h1>
          <p className="text-sm text-gray-500 mt-1">Review activity captures</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-gray-400">
          Loading...
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 text-red-700 rounded-xl border border-red-100">
          Failed to load screenshots. Make sure you have the correct
          permissions.
        </div>
      ) : screenshots.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-gray-200">
          <MonitorPlay className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No screenshots recorded on this date.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {screenshots.map((s: any) => {
            const time = new Date(s.capturedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div
                key={s._id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <a
                  href={s.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block relative group aspect-video bg-gray-100"
                >
                  <img
                    src={s.imageUrl}
                    alt="Screenshot"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </a>
                <div className="p-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">
                    {time}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
