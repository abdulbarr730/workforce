"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Laptop,
  Wifi,
  WifiOff,
  X,
  UserPlus,
  UserMinus,
  Clock,
  Calendar,
  ShieldCheck,
  Cpu,
  Trash2,
  Pencil,
  Check,
  Search,
  RefreshCw,
} from "lucide-react";

type Device = {
  _id: string;
  deviceId: string;
  hostname: string | null;
  os: string | null;
  platform: string | null;
  agentVersion: string | null;
  employeeId: string | null;
  lastSeenAt: string | null;
  lastEventType: string | null;
  lastIp: string | null;
  idleTimeoutMinutes?: number;
  employee: {
    employeeId: string;
    name: string;
    email: string;
    role: string;
    departmentName: string | null;
  } | null;
  shiftPolicy: {
    id: string;
    name: string;
    shiftStart: string | null;
    shiftEnd: string | null;
    workingDays: string[];
  } | null;
};

function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function isOnline(iso: string | null) {
  return iso ? Date.now() - new Date(iso).getTime() < 5 * 60 * 1000 : false;
}

export default function DevicesPage() {
  const qc = useQueryClient();
  const [assignFor, setAssignFor] = useState<Device | null>(null);
  const [viewDevice, setViewDevice] = useState<Device | null>(null);
  const [selectedEmp, setSelectedEmp] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [idleTimeoutFilter, setIdleTimeoutFilter] = useState("ALL");

  const {
    data: devices,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => api.get("/api/devices").then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users").then((r) => r.data.data),
  });
  // backend returns array directly OR {users: [...]} depending on caller — handle both
  const employees: Array<{ employeeId: string; name: string; email: string }> =
    Array.isArray(usersData) ? usersData : (usersData?.users ?? []);

  const assignMut = useMutation({
    mutationFn: ({
      deviceId,
      employeeId,
    }: {
      deviceId: string;
      employeeId: string;
    }) => api.patch(`/api/devices/${deviceId}/assign`, { employeeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      setAssignFor(null);
      setSelectedEmp("");
    },
  });

  const unassignMut = useMutation({
    mutationFn: (deviceId: string) =>
      api.patch(`/api/devices/${deviceId}/unassign`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (deviceId: string) => api.delete(`/api/devices/${deviceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });

  const total = devices?.length ?? 0;
  const online = devices?.filter((d) => isOnline(d.lastSeenAt)).length ?? 0;
  const assigned = devices?.filter((d) => d.employeeId).length ?? 0;

  const uniqueTimeouts = useMemo(() => {
    if (!devices) return [];
    const timeouts = devices.map((d) => d.idleTimeoutMinutes ?? 5);
    return Array.from(new Set(timeouts)).sort((a, b) => a - b);
  }, [devices]);

  const filteredDevices = useMemo(() => {
    if (!devices) return [];
    return devices.filter((d) => {
      let match = true;
      if (assignmentFilter === "ASSIGNED") match = match && !!d.employeeId;
      if (assignmentFilter === "UNASSIGNED") match = match && !d.employeeId;
      if (statusFilter === "ONLINE") match = match && isOnline(d.lastSeenAt);
      if (statusFilter === "OFFLINE") match = match && !isOnline(d.lastSeenAt);
      if (idleTimeoutFilter !== "ALL")
        match =
          match && (d.idleTimeoutMinutes ?? 5).toString() === idleTimeoutFilter;
      if (searchQuery) {
        const sq = searchQuery.toLowerCase();
        const hn = (d.hostname || "").toLowerCase();
        const did = (d.deviceId || "").toLowerCase();
        const ename = (d.employee?.name || "").toLowerCase();
        const eid = (d.employee?.employeeId || "").toLowerCase();
        match =
          match &&
          (hn.includes(sq) ||
            did.includes(sq) ||
            ename.includes(sq) ||
            eid.includes(sq));
      }
      return match;
    });
  }, [devices, assignmentFilter, statusFilter, idleTimeoutFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Desktop agents reporting from employee workstations
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search devices..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
            />
          </div>
          <select
            value={assignmentFilter}
            onChange={(e) => setAssignmentFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="ALL">All Assignment</option>
            <option value="ASSIGNED">Assigned Only</option>
            <option value="UNASSIGNED">Unassigned Only</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="ALL">All Status</option>
            <option value="ONLINE">Online</option>
            <option value="OFFLINE">Offline</option>
          </select>
          <select
            value={idleTimeoutFilter}
            onChange={(e) => setIdleTimeoutFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="ALL">All Timeouts</option>
            {uniqueTimeouts.map((t) => (
              <option key={t} value={t.toString()}>
                {t} Minutes
              </option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            className="px-3 py-2 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 text-gray-600 transition-colors flex items-center justify-center"
            title="Refresh Data"
            disabled={isRefetching}
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg,#232F3E,#131A22)" }}
          >
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Total
            </p>
            <p className="text-2xl font-bold">{total}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg,#FF9900,#E68A00)" }}
          >
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Online (5m)
            </p>
            <p className="text-2xl font-bold">{online}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg,#f59e0b,#b45309)" }}
          >
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Assigned
            </p>
            <p className="text-2xl font-bold">
              {assigned}
              <span className="text-base text-gray-400 font-medium">
                /{total}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">
            Loading devices…
          </div>
        ) : !devices || devices.length === 0 ? (
          <div className="p-12 text-center">
            <Laptop className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-700">
              No devices reporting yet
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Install the desktop agent on an employee workstation. It will
              appear here automatically on its first tracking ping.
            </p>
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-700">
              No matching devices
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Try clearing your search or filters.
            </p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Device</th>
                <th>OS</th>
                <th>Assigned to</th>
                <th>Last seen</th>
                <th>Status</th>
                <th className="text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((d) => {
                const online = isOnline(d.lastSeenAt);
                return (
                  <tr key={d._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {d.hostname || "Unknown"}
                          </p>
                          <p className="text-xs text-gray-500 font-mono truncate">
                            {d.deviceId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="text-sm">{d.os || "—"}</span>
                      {d.agentVersion && (
                        <span className="block text-[10px] text-gray-400">
                          v{d.agentVersion}
                        </span>
                      )}
                    </td>
                    <td>
                      {d.employee ? (
                        <div>
                          <p className="font-medium text-gray-900">
                            {d.employee.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {d.employee.employeeId} ·{" "}
                            {d.employee.departmentName || "—"}
                          </p>
                        </div>
                      ) : (
                        <span className="chip chip-gray">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className="text-sm">{timeAgo(d.lastSeenAt)}</span>
                      {d.lastEventType && (
                        <span className="block text-[10px] text-gray-400 uppercase tracking-wider">
                          {d.lastEventType}
                        </span>
                      )}
                    </td>
                    <td>
                      {online ? (
                        <span className="chip chip-green">
                          <Wifi className="w-3 h-3" /> Online
                        </span>
                      ) : (
                        <span className="chip chip-gray">
                          <WifiOff className="w-3 h-3" /> Offline
                        </span>
                      )}
                    </td>
                    <td className="text-right pr-6">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => setViewDevice(d)}
                          className="btn-ghost py-1.5"
                        >
                          View
                        </button>
                        {d.employeeId ? (
                          <button
                            onClick={() => unassignMut.mutate(d.deviceId)}
                            className="btn-ghost py-1.5 text-red-600"
                            disabled={unassignMut.isPending}
                          >
                            <UserMinus className="w-3.5 h-3.5 inline mr-1" />
                            Unassign
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setAssignFor(d);
                              setSelectedEmp("");
                            }}
                            className="btn-primary py-1.5"
                          >
                            <UserPlus className="w-3.5 h-3.5 inline mr-1" />
                            Assign
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                "Are you sure you want to delete this device?",
                              )
                            ) {
                              deleteMut.mutate(d.deviceId);
                            }
                          }}
                          className="btn-ghost py-1.5 text-red-600"
                          disabled={deleteMut.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Assign modal */}
      {assignFor && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setAssignFor(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Assign device
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-1">
                  {assignFor.hostname} · {assignFor.deviceId}
                </p>
              </div>
              <button
                onClick={() => setAssignFor(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Employee
            </label>
            <select
              className="input-field mb-4"
              value={selectedEmp}
              onChange={(e) => setSelectedEmp(e.target.value)}
            >
              <option value="">Select an employee…</option>
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.name} — {e.employeeId}
                </option>
              ))}
            </select>
            {assignMut.isError && (
              <p className="text-xs text-red-600 mb-3">
                Failed to assign. Try again.
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAssignFor(null)} className="btn-ghost">
                Cancel
              </button>
              <button
                onClick={() =>
                  selectedEmp &&
                  assignMut.mutate({
                    deviceId: assignFor.deviceId,
                    employeeId: selectedEmp,
                  })
                }
                disabled={!selectedEmp || assignMut.isPending}
                className="btn-primary"
              >
                {assignMut.isPending ? "Assigning…" : "Assign device"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View modal */}
      {viewDevice && (
        <DeviceDetailModal
          device={viewDevice}
          onClose={() => setViewDevice(null)}
        />
      )}
    </div>
  );
}

function DeviceDetailModal({
  device,
  onClose,
}: {
  device: Device;
  onClose: () => void;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(device.hostname || "");
  const [isEditingIdle, setIsEditingIdle] = useState(false);
  const [editIdle, setEditIdle] = useState(
    device.idleTimeoutMinutes?.toString() || "5",
  );
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const { data: analytics } = useQuery({
    queryKey: ["device-analytics", device.employeeId, today],
    queryFn: () =>
      api
        .get(
          `/api/analytics/employee-daily?employeeId=${device.employeeId}&date=${today}`,
        )
        .then((r) => r.data.data)
        .catch(() => null),
    enabled: !!device.employeeId,
  });

  const online = isOnline(device.lastSeenAt);

  const updateDeviceMut = useMutation({
    mutationFn: (data: { hostname?: string; idleTimeoutMinutes?: number }) =>
      api.patch(`/api/devices/${device.deviceId}`, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      setIsEditingName(false);
      setIsEditingIdle(false);
      if (res.data.data.hostname !== undefined)
        device.hostname = res.data.data.hostname;
      if (res.data.data.idleTimeoutMinutes !== undefined)
        device.idleTimeoutMinutes = res.data.data.idleTimeoutMinutes;
    },
  });

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="p-6 border-b border-gray-100 flex items-start justify-between"
          style={{ background: "linear-gradient(120deg,#eef2ff,#fff)" }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ background: "linear-gradient(135deg,#232F3E,#131A22)" }}
            >
              <Laptop className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="input-field py-1 px-2 text-sm h-8"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                    />
                    <button
                      onClick={() =>
                        updateDeviceMut.mutate({ hostname: editName })
                      }
                      className="btn-primary py-1 px-2 h-8"
                      disabled={updateDeviceMut.isPending}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingName(false);
                        setEditName(device.hostname || "");
                      }}
                      className="btn-ghost py-1 px-2 h-8"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-bold text-gray-900">
                      {device.hostname || "Unknown device"}
                    </h3>
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500 font-mono mt-1">
                {device.deviceId}
              </p>
              <div className="flex gap-2 mt-2">
                {online ? (
                  <span className="chip chip-green">
                    <Wifi className="w-3 h-3" /> Online
                  </span>
                ) : (
                  <span className="chip chip-gray">
                    <WifiOff className="w-3 h-3" /> Offline
                  </span>
                )}
                <span className="chip chip-indigo">
                  <Cpu className="w-3 h-3" /> {device.os || "Unknown OS"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Device metadata */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Device
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Hostname" value={device.hostname || "—"} />
              <Detail label="Operating System" value={device.os || "—"} />
              <Detail label="Platform" value={device.platform || "—"} />
              <Detail
                label="Agent version"
                value={device.agentVersion ? `v${device.agentVersion}` : "—"}
              />
              <Detail label="Last seen" value={timeAgo(device.lastSeenAt)} />

              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                  Idle Timeout
                </p>
                <div className="mt-0.5">
                  {isEditingIdle ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="120"
                        className="input-field py-0.5 px-2 text-sm h-7 w-20"
                        value={editIdle}
                        onChange={(e) => setEditIdle(e.target.value)}
                        autoFocus
                      />
                      <button
                        onClick={() =>
                          updateDeviceMut.mutate({
                            idleTimeoutMinutes: Number(editIdle),
                          })
                        }
                        className="btn-primary py-0.5 px-1.5 h-7"
                        disabled={updateDeviceMut.isPending}
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingIdle(false);
                          setEditIdle(
                            device.idleTimeoutMinutes?.toString() || "5",
                          );
                        }}
                        className="btn-ghost py-0.5 px-1.5 h-7"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-900 font-medium">
                        {device.idleTimeoutMinutes ?? 5} minutes
                      </p>
                      <button
                        onClick={() => setIsEditingIdle(true)}
                        className="text-gray-400 hover:text-indigo-600 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Employee */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Assigned employee
            </h4>
            {device.employee ? (
              <div className="card p-4 flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                  style={{
                    background: "linear-gradient(135deg,#FF9900,#E68A00)",
                  }}
                >
                  {device.employee.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    {device.employee.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {device.employee.email} · {device.employee.employeeId}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {device.employee.departmentName || "No department"} ·{" "}
                    {device.employee.role}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">
                No employee assigned.
              </div>
            )}
          </section>

          {/* Shift policy */}
          {device.shiftPolicy && (
            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                Shift policy
              </h4>
              <div className="card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <ShieldCheck className="w-5 h-5 text-orange-600" />
                  <p className="font-semibold text-gray-900">
                    {device.shiftPolicy.name}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Detail
                    label="Shift window"
                    value={
                      device.shiftPolicy.shiftStart &&
                      device.shiftPolicy.shiftEnd
                        ? `${device.shiftPolicy.shiftStart} – ${device.shiftPolicy.shiftEnd}`
                        : "—"
                    }
                    icon={<Clock className="w-3 h-3" />}
                  />
                  <Detail
                    label="Working days"
                    value={
                      (device.shiftPolicy.workingDays ?? []).join(", ") || "—"
                    }
                    icon={<Calendar className="w-3 h-3" />}
                  />
                </div>
              </div>
            </section>
          )}

          {/* Today's activity */}
          {device.employeeId && (
            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                Today&apos;s activity
              </h4>
              {analytics ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MiniStat
                    label="Productive"
                    value={
                      analytics.productiveMinutes ?? analytics.productive ?? "—"
                    }
                    suffix="min"
                    tone="green"
                  />
                  <MiniStat
                    label="Unproductive"
                    value={
                      analytics.unproductiveMinutes ??
                      analytics.unproductive ??
                      "—"
                    }
                    suffix="min"
                    tone="rose"
                  />
                  <MiniStat
                    label="Neutral"
                    value={analytics.neutralMinutes ?? analytics.neutral ?? "—"}
                    suffix="min"
                    tone="gray"
                  />
                  <MiniStat
                    label="Score"
                    value={analytics.productivityScore ?? "—"}
                    suffix=""
                    tone="indigo"
                  />
                </div>
              ) : (
                <div className="text-sm text-gray-500 italic">
                  No activity recorded today yet.
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm text-gray-900 mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string | number;
  suffix: string;
  tone: "green" | "rose" | "gray" | "indigo";
}) {
  const tones: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    gray: "bg-gray-100 text-gray-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <div className={`rounded-xl p-3 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-75">{label}</p>
      <p className="text-lg font-bold mt-1">
        {value}
        <span className="text-xs font-medium ml-1 opacity-75">{suffix}</span>
      </p>
    </div>
  );
}
