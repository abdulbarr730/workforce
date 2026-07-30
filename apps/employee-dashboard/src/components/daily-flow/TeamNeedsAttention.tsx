"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Users, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";

export function TeamNeedsAttention() {
  const { data: teamMisses } = useQuery({
    queryKey: ["team-missed-tasks"],
    queryFn: () => api.get("/api/team/missed-tasks").then((r) => r.data.data),
  });

  if (!teamMisses || teamMisses.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Users className="w-5 h-5 mr-2 text-indigo-500" />
        Team Needs Attention
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teamMisses.map((member: any) => (
          <div key={member.employeeId} className="bg-white rounded-xl border border-orange-100 p-4 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
            <div className="flex items-center space-x-3 mb-3">
              {member.avatar ? (
                <img src={member.avatar} alt={member.name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold">
                  {member.name.charAt(0)}
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{member.name}</h3>
                <p className="text-xs text-gray-500">{member.employeeId}</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center text-xs text-orange-700 font-medium mb-1">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Missed {member.missedTasks.length} day(s)
              </div>
              {member.missedTasks.slice(0, 3).map((task: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center text-xs bg-orange-50 p-1.5 rounded">
                  <span className="text-gray-700">{formatDate(task.date)}</span>
                  <div className="flex space-x-1">
                    {task.missedTodo && <span className="bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded">Todo</span>}
                    {task.missedEod && <span className="bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded">EOD</span>}
                  </div>
                </div>
              ))}
              {member.missedTasks.length > 3 && (
                <div className="text-xs text-center text-gray-500 mt-2">
                  + {member.missedTasks.length - 3} more
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
