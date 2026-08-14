import os from "os";
import Store from "electron-store";

const identityStore = new Store<{ stableDeviceId?: string }>({
  name: "device-identity",
});

// Persisted installation identity. Hostnames can change on macOS and using
// employee IDs elsewhere caused one physical Mac to appear as new devices.
export function getDeviceId(): string {
  const existing = identityStore.get("stableDeviceId");
  if (existing) return existing;
  // Preserve the legacy hostname ID on the first upgraded launch so the
  // existing admin device record is reused, then persist it permanently.
  const generated = os.hostname();
  identityStore.set("stableDeviceId", generated);
  return generated;
}

export function getDeviceMeta() {
  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    platform: os.platform(),
    agentVersion: process.env.npm_package_version || "unknown",
  };
}
