"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { format } from "date-fns";

interface FailedEvent {
  _id: string;
  rejectionReason: string;
  rawPayload: any;
  employeeId: string;
  deviceId: string;
  deviceTimestamp: string;
  createdAt: string;
}

export default function SyncErrorsPage() {
  const [errors, setErrors] = useState<FailedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchErrors = async () => {
      try {
        const token = localStorage.getItem("token");
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
        const res = await axios.get(`${API_URL}/tracking/sync-errors`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setErrors(res.data.data || []);
      } catch (err) {
        console.error("Failed to fetch sync errors", err);
      } finally {
        setLoading(false);
      }
    };

    fetchErrors();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dead Letter Queue</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            A log of fundamentally broken offline events that were rejected by the system strict rules.
            They are isolated here so they do not block the valid queue.
          </p>
        </div>
        <div className="bg-red-100 text-red-800 px-4 py-2 rounded-lg text-sm font-semibold border border-red-200">
          {errors.length} Sync Errors Found
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      ) : errors.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-12 text-center">
          <h3 className="text-lg font-medium text-green-900">Queue is Healthy!</h3>
          <p className="mt-1 text-sm text-green-600">No corrupted events found. All offline tracking data synced perfectly.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-200 sm:pl-6">Received At</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">Device Details</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">Rejection Reason</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">Raw Payload Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {errors.map((error) => (
                <tr key={error._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-500 dark:text-gray-400 sm:pl-6">
                    {format(new Date(error.createdAt), "MMM d, yyyy HH:mm:ss")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <div className="font-medium text-gray-900 dark:text-white">Emp: {error.employeeId}</div>
                    <div className="text-gray-500 dark:text-gray-400 mt-1 text-xs font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded inline-block">
                      {error.deviceId}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-sm">
                    <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                      Zod Strict Rule Failed
                    </span>
                    <p className="mt-2 text-xs text-red-600 max-w-xs truncate" title={error.rejectionReason}>
                      {error.rejectionReason}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-500 font-mono">
                    <div className="max-w-md max-h-24 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700 text-xs">
                      <pre>{JSON.stringify(error.rawPayload, null, 2)}</pre>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
