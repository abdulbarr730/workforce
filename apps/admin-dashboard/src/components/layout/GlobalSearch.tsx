"use client";
import { useState, useEffect, useRef } from "react";
import {
  Search,
  X,
  User,
  Monitor,
  MonitorPlay,
  ChevronRight,
  Building2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
    enabled: open,
  });

  const { data: devicesData } = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.get("/api/devices/list").then((r) => r.data.data),
    enabled: open,
  });

  const { data: departmentsData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/api/departments").then((r) => r.data.data),
    enabled: open,
  });

  const allUsers = Array.isArray(usersData)
    ? usersData
    : (usersData?.users ?? []);
  const users = allUsers.filter(
    (u: any) => u.role !== "ADMIN" && u.role !== "SUPER_ADMIN",
  );

  const devices = Array.isArray(devicesData)
    ? devicesData
    : (devicesData?.devices ?? []);
  const departments = Array.isArray(departmentsData)
    ? departmentsData
    : (departmentsData?.departments ?? []);

  const filteredUsers =
    search.trim() === ""
      ? []
      : users
          .filter(
            (u: any) =>
              u.name?.toLowerCase().includes(search.toLowerCase()) ||
              u.employeeId?.toLowerCase().includes(search.toLowerCase()) ||
              u.role?.toLowerCase().includes(search.toLowerCase()) ||
              u.department?.toLowerCase().includes(search.toLowerCase()),
          )
          .slice(0, 5);

  const filteredDevices =
    search.trim() === ""
      ? []
      : devices
          .filter(
            (d: any) =>
              d.deviceId?.toLowerCase().includes(search.toLowerCase()) ||
              d.metadata?.os?.toLowerCase().includes(search.toLowerCase()) ||
              d.metadata?.hostname
                ?.toLowerCase()
                .includes(search.toLowerCase()),
          )
          .slice(0, 5);

  const filteredDepartments =
    search.trim() === ""
      ? []
      : departments
          .filter((d: any) =>
            d.name?.toLowerCase().includes(search.toLowerCase()),
          )
          .slice(0, 5);

  const handleUserClick = (id: string) => {
    router.push(`/dashboard/analytics?employeeId=${id}`);
    setOpen(false);
  };

  const handleDeviceClick = () => {
    router.push(`/dashboard/devices`);
    setOpen(false);
  };

  const handleDepartmentClick = () => {
    router.push(`/dashboard/departments`);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-400 w-64 hover:bg-gray-100 transition-colors text-left cursor-text relative"
      >
        <Search className="w-4 h-4" />
        <span className="text-xs">Search employees, devices…</span>
        <span className="absolute right-2 text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm font-medium hidden lg:inline-block text-gray-500">
          Ctrl K
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 sm:pt-32">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setOpen(false)}
          />

          {/* Command Palette */}
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-gray-200 transform transition-all animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center border-b border-gray-100 px-4 py-3">
              <Search className="w-5 h-5 text-indigo-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-transparent border-0 focus:ring-0 text-gray-900 placeholder-gray-400 pl-3 pr-4 text-base"
                placeholder="Search employees or devices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {search.trim() === "" ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  <MonitorPlay className="w-8 h-8 text-indigo-200 mx-auto mb-3" />
                  <p>Start typing to search across Prosync</p>
                </div>
              ) : (
                <div className="p-2 space-y-4">
                  {/* Employees Results */}
                  {filteredUsers.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Employees
                      </div>
                      <div className="space-y-1">
                        {filteredUsers.map((u: any) => (
                          <button
                            key={u._id}
                            onClick={() => handleUserClick(u.employeeId)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-indigo-50 transition-colors text-left group"
                          >
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              {u.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {u.name}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {u.employeeId} • {u.role}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Devices Results */}
                  {filteredDevices.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Devices
                      </div>
                      <div className="space-y-1">
                        {filteredDevices.map((d: any) => (
                          <button
                            key={d.deviceId}
                            onClick={handleDeviceClick}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-emerald-50 transition-colors text-left group"
                          >
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                              <Monitor className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {d.metadata?.hostname || d.deviceId}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {d.metadata?.os || "Unknown OS"}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Departments Results */}
                  {filteredDepartments.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Departments
                      </div>
                      <div className="space-y-1">
                        {filteredDepartments.map((d: any) => (
                          <button
                            key={d._id}
                            onClick={handleDepartmentClick}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-orange-50 transition-colors text-left group"
                          >
                            <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {d.name}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {d.parentDepartment
                                  ? `Under ${d.parentDepartment}`
                                  : "Main Department"}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredUsers.length === 0 &&
                    filteredDevices.length === 0 &&
                    filteredDepartments.length === 0 && (
                      <div className="py-12 text-center text-sm text-gray-500">
                        <p>No results found for "{search}"</p>
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium bg-white border border-gray-200 px-1 rounded shadow-sm">
                  ↑
                </span>
                <span className="font-medium bg-white border border-gray-200 px-1 rounded shadow-sm">
                  ↓
                </span>
                <span>to navigate</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">
                  Esc
                </span>
                <span>to close</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
