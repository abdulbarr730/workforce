"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  Clock,
  Copy,
  Calendar,
  Shield,
  Check,
  RotateCcw,
  Camera,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

export interface DaySchedule {
  day: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

const ALL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_TRACKING_SCHEDULE: DaySchedule[] = [
  { day: "Monday", enabled: true, startTime: "09:00", endTime: "17:00" },
  { day: "Tuesday", enabled: true, startTime: "09:00", endTime: "17:00" },
  { day: "Wednesday", enabled: true, startTime: "09:00", endTime: "17:00" },
  { day: "Thursday", enabled: true, startTime: "09:00", endTime: "17:00" },
  { day: "Friday", enabled: true, startTime: "09:00", endTime: "17:00" },
  { day: "Saturday", enabled: false, startTime: "09:00", endTime: "17:00" },
  { day: "Sunday", enabled: false, startTime: "09:00", endTime: "17:00" },
];

const DEFAULT_IDLE_EXEMPTION_SCHEDULE: DaySchedule[] = [
  { day: "Monday", enabled: false, startTime: "17:00", endTime: "21:00" },
  { day: "Tuesday", enabled: false, startTime: "17:00", endTime: "21:00" },
  { day: "Wednesday", enabled: true, startTime: "17:00", endTime: "21:00" },
  { day: "Thursday", enabled: true, startTime: "17:00", endTime: "21:00" },
  { day: "Friday", enabled: false, startTime: "17:00", endTime: "21:00" },
  { day: "Saturday", enabled: false, startTime: "17:00", endTime: "21:00" },
  { day: "Sunday", enabled: false, startTime: "17:00", endTime: "21:00" },
];

function buildTrackingSchedule(user?: Partial<User>): DaySchedule[] {
  if (user?.trackingDaySchedules && user.trackingDaySchedules.length > 0) {
    return ALL_DAYS.map((day) => {
      const found = user.trackingDaySchedules?.find(
        (d) => d.day.toLowerCase() === day.toLowerCase(),
      );
      if (found) {
        return {
          day,
          enabled: !!found.enabled,
          startTime: found.startTime || "09:00",
          endTime: found.endTime || "17:00",
        };
      }
      const isLegacyDay = (user.trackingDays || []).some(
        (d) => d.toLowerCase() === day.toLowerCase(),
      );
      return {
        day,
        enabled: isLegacyDay,
        startTime: user.trackingStartTime || "09:00",
        endTime: user.trackingEndTime || "17:00",
      };
    });
  }

  const legacyDays = user?.trackingDays || [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ];
  return ALL_DAYS.map((day) => ({
    day,
    enabled: legacyDays.some((d) => d.toLowerCase() === day.toLowerCase()),
    startTime: user?.trackingStartTime || "09:00",
    endTime: user?.trackingEndTime || "17:00",
  }));
}

function buildIdleExemptionSchedule(user?: Partial<User>): DaySchedule[] {
  if (
    user?.idleExemptionDaySchedules &&
    user.idleExemptionDaySchedules.length > 0
  ) {
    return ALL_DAYS.map((day) => {
      const found = user.idleExemptionDaySchedules?.find(
        (d) => d.day.toLowerCase() === day.toLowerCase(),
      );
      if (found) {
        return {
          day,
          enabled: !!found.enabled,
          startTime: found.startTime || "17:00",
          endTime: found.endTime || "21:00",
        };
      }
      const isLegacyDay = (user.idleExemptionDays || []).some(
        (d) => d.toLowerCase() === day.toLowerCase(),
      );
      return {
        day,
        enabled: isLegacyDay,
        startTime: user.idleExemptionStartTime || "17:00",
        endTime: user.idleExemptionEndTime || "21:00",
      };
    });
  }

  const legacyDays = user?.idleExemptionDays || ["Saturday", "Sunday"];
  return ALL_DAYS.map((day) => ({
    day,
    enabled: legacyDays.some((d) => d.toLowerCase() === day.toLowerCase()),
    startTime: user?.idleExemptionStartTime || "17:00",
    endTime: user?.idleExemptionEndTime || "21:00",
  }));
}

interface User {
  _id: string;
  employeeId: string;
  name: string;
  email: string;
  role: string;
  departmentId?: string;
  departmentName?: string;
  assignedShiftPolicyId?: string;
  assignedShiftPolicyName?: string;
  isActive: boolean;
  isScreenshotTrackingEnabled?: boolean;
  screenshotInterval?: number;
  enforceTrackingSchedule?: boolean;
  trackingDays?: string[];
  trackingStartTime?: string;
  trackingEndTime?: string;
  trackingDaySchedules?: DaySchedule[];
  isIdleExemptionEnabled?: boolean;
  idleExemptionDays?: string[];
  idleExemptionStartTime?: string;
  idleExemptionEndTime?: string;
  idleExemptionDaySchedules?: DaySchedule[];
  checkinIntervalMinutes?: number;
  customCheckinTimes?: string[];
}

const ROLES = ["EMPLOYEE", "MANAGER", "HR", "ADMIN"];

export default function EmployeesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const defaultFormState = {
    _id: "",
    name: "",
    email: "",
    password: "",
    employeeId: "",
    role: "EMPLOYEE",
    departmentId: "",
    departmentName: "",
    assignedShiftPolicyId: "",
    isScreenshotTrackingEnabled: false,
    screenshotInterval: 300,
    enforceTrackingSchedule: false,
    trackingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    trackingStartTime: "09:00",
    trackingEndTime: "17:00",
    trackingDaySchedules: DEFAULT_TRACKING_SCHEDULE,
    isIdleExemptionEnabled: false,
    idleExemptionDays: ["Saturday", "Sunday"],
    idleExemptionStartTime: "00:00",
    idleExemptionEndTime: "23:59",
    idleExemptionDaySchedules: DEFAULT_IDLE_EXEMPTION_SCHEDULE,
    checkinIntervalMinutes: 120,
    customCheckinTimes: [] as string[],
    customCheckinTimesStr: "",
  };
  const [form, setForm] = useState(defaultFormState);
  const [formError, setFormError] = useState("");
  const isEditing = !!form._id;

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/api/departments").then((r) => r.data.data),
  });

  const { data: shiftPolicies } = useQuery({
    queryKey: ["shiftPolicies"],
    queryFn: () => api.get("/api/attendance/shifts").then((r) => r.data.data),
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.get("/api/devices").then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const createUser = useMutation({
    mutationFn: (payload: typeof form) => {
      const { _id, customCheckinTimesStr, ...data } = payload as any;
      if (customCheckinTimesStr !== undefined) {
        data.customCheckinTimes = customCheckinTimesStr
          ? customCheckinTimesStr
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [];
      }
      if (isEditing) {
        if (!data.password) delete (data as any).password;
        return api.put(`/api/users/${_id}`, data);
      }
      return api.post("/api/users", data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setForm(defaultFormState);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setFormError(
        msg ||
          (isEditing
            ? "Failed to update employee"
            : "Failed to create employee"),
      );
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const users: User[] = Array.isArray(data) ? data : (data?.users ?? []);
  const filtered = users.filter(
    (u) =>
      u.role !== "SUPER_ADMIN" &&
      u.role !== "ADMIN" &&
      (roleFilter === "All" || u.role === roleFilter) &&
      (u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.employeeId.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())),
  );

  useEffect(() => {
    if (!isEditing && form.departmentId && form.role) {
      const selectedDept = (departments?.departments ?? []).find(
        (d: any) => d._id === form.departmentId,
      );
      const deptCode = selectedDept?.code || "01";
      const usersInDept = users.filter(
        (u: any) => u.departmentId === form.departmentId,
      );
      const suffixes = usersInDept
        .map((u: any) => u.employeeId?.replace(`EMP_${deptCode}_`, "") || "")
        .map((s: string) => parseInt(s, 10))
        .filter((n: number) => !isNaN(n));

      let assignedSuffix = 1;
      if (form.role === "MANAGER" && !suffixes.includes(1)) {
        assignedSuffix = 1;
      } else {
        assignedSuffix = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 2;
        if (assignedSuffix === 1 && form.role !== "MANAGER") {
          assignedSuffix = 2;
        }
      }
      const newId = `EMP_${deptCode}_${assignedSuffix.toString().padStart(2, "0")}`;
      setForm((prev) =>
        prev.employeeId === newId ? prev : { ...prev, employeeId: newId },
      );
    }
  }, [form.departmentId, form.role, isEditing, departments, users]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Employees{" "}
            <span className="text-sm font-normal text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full ml-2">
              Logged in as: {user?.role}
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {
              users.filter(
                (u) => u.role !== "SUPER_ADMIN" && u.role !== "ADMIN",
              ).length
            }{" "}
            total employees
          </p>
        </div>
        <button
          onClick={() => {
            setForm(defaultFormState);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm rounded-lg transition-colors"
          style={{ backgroundColor: "#FF9900" }}
        >
          <Plus className="w-4 h-4" /> Add Employee
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID or email..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="All">All Roles</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="HR">HR</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Loading...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 w-16">
                    Sr. No
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    Employee
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    ID
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    Role
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    Department
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    Status
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, index) => (
                  <tr
                    key={user._id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {user.name}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.employeeId}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.departmentName || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${user.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                        >
                          Acc: {user.isActive ? "Active" : "Disabled"}
                        </span>
                        {(() => {
                          const userDevices = Array.isArray(devices)
                            ? devices.filter(
                                (d: any) => d.employeeId === user.employeeId,
                              )
                            : [];
                          const isOnline = userDevices.some(
                            (d: any) =>
                              d.lastSeenAt &&
                              Date.now() - new Date(d.lastSeenAt).getTime() <
                                5 * 60 * 1000,
                          );
                          return (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isOnline ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}
                            >
                              Agent: {isOnline ? "Online" : "Offline"}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setForm({
                            _id: user._id,
                            name: user.name,
                            email: user.email,
                            password: "",
                            employeeId: user.employeeId,
                            role: user.role,
                            departmentId: user.departmentId || "",
                            departmentName: user.departmentName || "",
                            assignedShiftPolicyId:
                              user.assignedShiftPolicyId || "",
                            isScreenshotTrackingEnabled:
                              !!user.isScreenshotTrackingEnabled,
                            screenshotInterval: user.screenshotInterval || 300,
                            enforceTrackingSchedule:
                              !!user.enforceTrackingSchedule,
                            trackingDaySchedules: buildTrackingSchedule(user),
                            trackingDays: user.trackingDays || [
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                            ],
                            trackingStartTime:
                              user.trackingStartTime || "09:00",
                            trackingEndTime: user.trackingEndTime || "17:00",
                            isIdleExemptionEnabled:
                              !!user.isIdleExemptionEnabled,
                            idleExemptionDaySchedules:
                              buildIdleExemptionSchedule(user),
                            idleExemptionDays: user.idleExemptionDays || [
                              "Saturday",
                              "Sunday",
                            ],
                            idleExemptionStartTime:
                              user.idleExemptionStartTime || "00:00",
                            idleExemptionEndTime:
                              user.idleExemptionEndTime || "23:59",
                            checkinIntervalMinutes:
                              user.checkinIntervalMinutes !== undefined
                                ? user.checkinIntervalMinutes
                                : 120,
                            customCheckinTimes: user.customCheckinTimes || [],
                            customCheckinTimesStr: (
                              user.customCheckinTimes || []
                            ).join(", "),
                          });
                          setShowForm(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              "Are you sure you want to delete this employee?",
                            )
                          ) {
                            deleteUser.mutate(user._id);
                          }
                        }}
                        disabled={deleteUser.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors ml-1"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-gray-400"
                    >
                      No employees found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-gray-100 overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/70 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {isEditing ? "Edit Employee" : "Add Employee"}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage profile details, system roles, and per-day tracking schedules
                </p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  setFormError("");
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFormError("");
                const enabledTracking = (
                  form.trackingDaySchedules || []
                ).filter((d) => d.enabled);
                const enabledIdle = (
                  form.idleExemptionDaySchedules || []
                ).filter((d) => d.enabled);

                const finalPayload = {
                  ...form,
                  trackingDays: enabledTracking.map((d) => d.day),
                  trackingStartTime:
                    enabledTracking[0]?.startTime ||
                    form.trackingStartTime ||
                    "09:00",
                  trackingEndTime:
                    enabledTracking[0]?.endTime ||
                    form.trackingEndTime ||
                    "17:00",
                  idleExemptionDays: enabledIdle.map((d) => d.day),
                  idleExemptionStartTime:
                    enabledIdle[0]?.startTime ||
                    form.idleExemptionStartTime ||
                    "17:00",
                  idleExemptionEndTime:
                    enabledIdle[0]?.endTime ||
                    form.idleExemptionEndTime ||
                    "21:00",
                };
                createUser.mutate(finalPayload);
              }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
                {/* Section 1: Basic Information */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                    Employee Credentials & Identity
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        placeholder="e.g. John Doe"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                        placeholder="john@example.com"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Password {isEditing ? "(Optional)" : <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="password"
                        required={!isEditing}
                        value={form.password}
                        onChange={(e) =>
                          setForm({ ...form, password: e.target.value })
                        }
                        placeholder={
                          isEditing
                            ? "Leave blank to keep current"
                            : "Minimum 6 characters"
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Employee ID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.employeeId}
                        onChange={(e) =>
                          setForm({ ...form, employeeId: e.target.value })
                        }
                        placeholder="e.g. EMP-001"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Department & Role */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                    Assignment & Permissions
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Department <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.departmentId}
                        onChange={(e) => {
                          const sel = (departments?.departments ?? []).find(
                            (d: any) => d._id === e.target.value,
                          );
                          setForm({
                            ...form,
                            departmentId: e.target.value,
                            departmentName: sel?.name || "",
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        required
                      >
                        <option value="">Select department</option>
                        {(departments?.departments ?? []).map(
                          (d: { _id: string; name: string }) => (
                            <option key={d._id} value={d._id}>
                              {d.name}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        System Role <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.role}
                        onChange={(e) =>
                          setForm({ ...form, role: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Shift Policy
                      </label>
                      <select
                        value={form.assignedShiftPolicyId}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            assignedShiftPolicyId: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Default / None</option>
                        {(shiftPolicies ?? []).map(
                          (s: { _id: string; name: string }) => (
                            <option key={s._id} value={s._id}>
                              {s.name}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 3: Monitoring & Security (Super Admin only for screenshot intervals) */}
                {(user?.role === "SUPER_ADMIN" || user?.role === "ADMIN") && (
                  <div className="space-y-4 pt-2 border-t border-gray-100">
                    {user?.role === "SUPER_ADMIN" && (
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                              <Camera className="w-4 h-4" />
                            </div>
                            <div>
                              <label
                                htmlFor="isScreenshotTrackingEnabled"
                                className="text-xs font-semibold text-gray-900 cursor-pointer"
                              >
                                Periodic Screenshot Captures
                              </label>
                              <p className="text-[11px] text-gray-500">
                                Captures desktop screens at configured intervals
                              </p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            id="isScreenshotTrackingEnabled"
                            checked={form.isScreenshotTrackingEnabled}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                isScreenshotTrackingEnabled: e.target.checked,
                              })
                            }
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                          />
                        </div>

                        {form.isScreenshotTrackingEnabled && (
                          <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between gap-4">
                            <label className="text-xs font-medium text-gray-700">
                              Capture Interval
                            </label>
                            <select
                              value={form.screenshotInterval}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  screenshotInterval: parseInt(
                                    e.target.value,
                                    10,
                                  ),
                                })
                              }
                              className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-medium text-gray-700 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="10">Every 10 Seconds (Testing Only)</option>
                              <option value="60">Every 1 Minute</option>
                              <option value="300">Every 5 Minutes (Recommended)</option>
                              <option value="600">Every 10 Minutes</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Check-in Pop-up Schedule Block */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-900">
                              Task Check-in Pop-up Frequency
                            </label>
                            <p className="text-[11px] text-gray-500">
                              How often desktop agent notifies employee to log completed tasks
                            </p>
                          </div>
                        </div>
                        <select
                          value={form.checkinIntervalMinutes}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              checkinIntervalMinutes: parseInt(e.target.value, 10),
                            })
                          }
                          className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-medium text-gray-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="60">Every 1 Hour (60 mins)</option>
                          <option value="90">Every 1.5 Hours (90 mins)</option>
                          <option value="120">Every 2 Hours (120 mins - Default)</option>
                          <option value="180">Every 3 Hours (180 mins)</option>
                          <option value="240">Every 4 Hours (240 mins)</option>
                          <option value="-1">Custom Times (Specific Hours)</option>
                          <option value="0">Disabled (No Check-ins)</option>
                        </select>
                      </div>

                      {(form.checkinIntervalMinutes === -1 ||
                        (form.customCheckinTimesStr && form.customCheckinTimesStr.length > 0)) && (
                        <div className="mt-3 pt-3 border-t border-slate-200/60">
                          <label className="text-xs font-medium text-gray-700 block mb-1">
                            Specific Pop-up Times (24h format separated by commas)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 11:00, 13:30, 15:30, 17:30"
                            value={form.customCheckinTimesStr}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                customCheckinTimesStr: e.target.value,
                              })
                            }
                            className="w-full px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-mono text-gray-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                          <p className="text-[10px] text-gray-400 mt-1">
                            Agent will prompt at these exact daily times instead of fixed intervals.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Section 4: Daily Tracking Schedule */}
                    <div className="space-y-4">
                      {/* Tracking Schedule Block */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                        <div className="p-4 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                              <Clock className="w-4 h-4" />
                            </div>
                            <div>
                              <label
                                htmlFor="enforceTrackingSchedule"
                                className="text-xs font-semibold text-gray-900 cursor-pointer"
                              >
                                Enforce Tracking Schedule
                              </label>
                              <p className="text-[11px] text-gray-500">
                                Automatically pauses agent tracking outside designated daily hours
                              </p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            id="enforceTrackingSchedule"
                            checked={form.enforceTrackingSchedule}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                enforceTrackingSchedule: e.target.checked,
                              })
                            }
                            className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
                          />
                        </div>

                        {form.enforceTrackingSchedule && (
                          <div className="p-4 space-y-3 bg-white">
                            {/* Preset Quick-Buttons */}
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-xs">
                              <span className="font-semibold text-gray-700">
                                Daily Schedule
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-gray-400 mr-1">
                                  Presets:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (
                                      form.trackingDaySchedules || []
                                    ).map((s) => ({
                                      ...s,
                                      enabled:
                                        s.day !== "Saturday" &&
                                        s.day !== "Sunday",
                                    }));
                                    setForm({
                                      ...form,
                                      trackingDaySchedules: updated,
                                    });
                                  }}
                                  className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                >
                                  Mon–Fri
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (
                                      form.trackingDaySchedules || []
                                    ).map((s) => ({
                                      ...s,
                                      enabled: true,
                                    }));
                                    setForm({
                                      ...form,
                                      trackingDaySchedules: updated,
                                    });
                                  }}
                                  className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                >
                                  All 7 Days
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (
                                      form.trackingDaySchedules || []
                                    ).map((s) => ({
                                      ...s,
                                      enabled: false,
                                    }));
                                    setForm({
                                      ...form,
                                      trackingDaySchedules: updated,
                                    });
                                  }}
                                  className="px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>

                            {/* Schedule Rows */}
                            <div className="space-y-1.5">
                              {(form.trackingDaySchedules || []).map(
                                (schedule, idx) => {
                                  const isEnabled = schedule.enabled;
                                  return (
                                    <div
                                      key={schedule.day}
                                      className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-all ${
                                        isEnabled
                                          ? "bg-emerald-50/20 border-emerald-200/70"
                                          : "bg-gray-50/60 border-gray-100 opacity-60"
                                      }`}
                                    >
                                      <label className="flex items-center gap-2.5 font-medium text-gray-800 min-w-[120px] cursor-pointer text-xs">
                                        <input
                                          type="checkbox"
                                          checked={isEnabled}
                                          onChange={(e) => {
                                            const updated = [
                                              ...(form.trackingDaySchedules ||
                                                []),
                                            ];
                                            updated[idx] = {
                                              ...updated[idx],
                                              enabled: e.target.checked,
                                            };
                                            setForm({
                                              ...form,
                                              trackingDaySchedules: updated,
                                            });
                                          }}
                                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <span className="font-semibold">{schedule.day}</span>
                                      </label>

                                      {isEnabled ? (
                                        <div className="flex items-center gap-2 flex-1 justify-end">
                                          <div className="flex items-center gap-1 bg-white px-2 py-1 border border-gray-200 rounded-md shadow-2xs">
                                            <span className="text-[10px] uppercase font-bold text-gray-400">
                                              Start
                                            </span>
                                            <input
                                              type="time"
                                              value={schedule.startTime}
                                              onChange={(e) => {
                                                const updated = [
                                                  ...(form.trackingDaySchedules ||
                                                    []),
                                                ];
                                                updated[idx] = {
                                                  ...updated[idx],
                                                  startTime: e.target.value,
                                                };
                                                setForm({
                                                  ...form,
                                                  trackingDaySchedules: updated,
                                                });
                                              }}
                                              className="text-xs font-semibold text-gray-800 bg-transparent focus:outline-hidden"
                                            />
                                          </div>
                                          <span className="text-gray-400 font-bold">
                                            –
                                          </span>
                                          <div className="flex items-center gap-1 bg-white px-2 py-1 border border-gray-200 rounded-md shadow-2xs">
                                            <span className="text-[10px] uppercase font-bold text-gray-400">
                                              End
                                            </span>
                                            <input
                                              type="time"
                                              value={schedule.endTime}
                                              onChange={(e) => {
                                                const updated = [
                                                  ...(form.trackingDaySchedules ||
                                                    []),
                                                ];
                                                updated[idx] = {
                                                  ...updated[idx],
                                                  endTime: e.target.value,
                                                };
                                                setForm({
                                                  ...form,
                                                  trackingDaySchedules: updated,
                                                });
                                              }}
                                              className="text-xs font-semibold text-gray-800 bg-transparent focus:outline-hidden"
                                            />
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = (
                                                form.trackingDaySchedules || []
                                              ).map((item) => ({
                                                ...item,
                                                startTime: schedule.startTime,
                                                endTime: schedule.endTime,
                                              }));
                                              setForm({
                                                ...form,
                                                trackingDaySchedules: updated,
                                              });
                                            }}
                                            className="ml-2 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 hover:underline shrink-0"
                                            title="Apply this timing to all active days"
                                          >
                                            Apply to all
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-right text-[11px] text-gray-400 font-medium italic">
                                          Day Off / Not Tracked
                                        </span>
                                      )}
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Idle Exemption Schedule Block */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                        <div className="p-4 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                              <Shield className="w-4 h-4" />
                            </div>
                            <div>
                              <label
                                htmlFor="isIdleExemptionEnabled"
                                className="text-xs font-semibold text-gray-900 cursor-pointer"
                              >
                                Disable Idle Popup (Specific Schedule)
                              </label>
                              <p className="text-[11px] text-gray-500">
                                Mutes inactivity prompts & idle popups during designated times
                              </p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            id="isIdleExemptionEnabled"
                            checked={form.isIdleExemptionEnabled}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                isIdleExemptionEnabled: e.target.checked,
                              })
                            }
                            className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 cursor-pointer"
                          />
                        </div>

                        {form.isIdleExemptionEnabled && (
                          <div className="p-4 space-y-3 bg-white">
                            {/* Preset Quick-Buttons */}
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-xs">
                              <span className="font-semibold text-gray-700">
                                Idle Exemption Schedule
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-gray-400 mr-1">
                                  Presets:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (
                                      form.idleExemptionDaySchedules || []
                                    ).map((s) => ({
                                      ...s,
                                      enabled:
                                        s.day === "Saturday" ||
                                        s.day === "Sunday",
                                    }));
                                    setForm({
                                      ...form,
                                      idleExemptionDaySchedules: updated,
                                    });
                                  }}
                                  className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                >
                                  Weekends
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (
                                      form.idleExemptionDaySchedules || []
                                    ).map((s) => ({
                                      ...s,
                                      enabled: true,
                                    }));
                                    setForm({
                                      ...form,
                                      idleExemptionDaySchedules: updated,
                                    });
                                  }}
                                  className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                >
                                  All Days
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (
                                      form.idleExemptionDaySchedules || []
                                    ).map((s) => ({
                                      ...s,
                                      enabled: false,
                                    }));
                                    setForm({
                                      ...form,
                                      idleExemptionDaySchedules: updated,
                                    });
                                  }}
                                  className="px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>

                            {/* Schedule Rows */}
                            <div className="space-y-1.5">
                              {(form.idleExemptionDaySchedules || []).map(
                                (schedule, idx) => {
                                  const isEnabled = schedule.enabled;
                                  return (
                                    <div
                                      key={schedule.day}
                                      className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-all ${
                                        isEnabled
                                          ? "bg-amber-50/20 border-amber-200/70"
                                          : "bg-gray-50/60 border-gray-100 opacity-60"
                                      }`}
                                    >
                                      <label className="flex items-center gap-2.5 font-medium text-gray-800 min-w-[120px] cursor-pointer text-xs">
                                        <input
                                          type="checkbox"
                                          checked={isEnabled}
                                          onChange={(e) => {
                                            const updated = [
                                              ...(form.idleExemptionDaySchedules ||
                                                []),
                                            ];
                                            updated[idx] = {
                                              ...updated[idx],
                                              enabled: e.target.checked,
                                            };
                                            setForm({
                                              ...form,
                                              idleExemptionDaySchedules:
                                                updated,
                                            });
                                          }}
                                          className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <span className="font-semibold">{schedule.day}</span>
                                      </label>

                                      {isEnabled ? (
                                        <div className="flex items-center gap-2 flex-1 justify-end">
                                          <div className="flex items-center gap-1 bg-white px-2 py-1 border border-gray-200 rounded-md shadow-2xs">
                                            <span className="text-[10px] uppercase font-bold text-gray-400">
                                              Start
                                            </span>
                                            <input
                                              type="time"
                                              value={schedule.startTime}
                                              onChange={(e) => {
                                                const updated = [
                                                  ...(form.idleExemptionDaySchedules ||
                                                    []),
                                                ];
                                                updated[idx] = {
                                                  ...updated[idx],
                                                  startTime: e.target.value,
                                                };
                                                setForm({
                                                  ...form,
                                                  idleExemptionDaySchedules:
                                                    updated,
                                                });
                                              }}
                                              className="text-xs font-semibold text-gray-800 bg-transparent focus:outline-hidden"
                                            />
                                          </div>
                                          <span className="text-gray-400 font-bold">
                                            –
                                          </span>
                                          <div className="flex items-center gap-1 bg-white px-2 py-1 border border-gray-200 rounded-md shadow-2xs">
                                            <span className="text-[10px] uppercase font-bold text-gray-400">
                                              End
                                            </span>
                                            <input
                                              type="time"
                                              value={schedule.endTime}
                                              onChange={(e) => {
                                                const updated = [
                                                  ...(form.idleExemptionDaySchedules ||
                                                    []),
                                                ];
                                                updated[idx] = {
                                                  ...updated[idx],
                                                  endTime: e.target.value,
                                                };
                                                setForm({
                                                  ...form,
                                                  idleExemptionDaySchedules:
                                                    updated,
                                                });
                                              }}
                                              className="text-xs font-semibold text-gray-800 bg-transparent focus:outline-hidden"
                                            />
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = (
                                                form.idleExemptionDaySchedules ||
                                                []
                                              ).map((item) => ({
                                                ...item,
                                                startTime: schedule.startTime,
                                                endTime: schedule.endTime,
                                              }));
                                              setForm({
                                                ...form,
                                                idleExemptionDaySchedules:
                                                  updated,
                                              });
                                            }}
                                            className="ml-2 text-[11px] font-medium text-amber-700 hover:text-amber-900 hover:underline shrink-0"
                                            title="Apply this timing to all active days"
                                          >
                                            Apply to all
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-right text-[11px] text-gray-400 font-medium italic">
                                          Normal Monitoring (Active)
                                        </span>
                                      )}
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {formError && (
                <div className="px-6 py-2 bg-red-50 border-t border-red-100">
                  <p className="text-xs font-medium text-red-600">{formError}</p>
                </div>
              )}

              {/* Sticky Footer Actions */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/70 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormError("");
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUser.isPending}
                  className="px-5 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-all shadow-xs flex items-center gap-2"
                  style={{ backgroundColor: "#232F3E" }}
                >
                  {createUser.isPending
                    ? "Saving..."
                    : isEditing
                      ? "Save Changes"
                      : "Create Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
