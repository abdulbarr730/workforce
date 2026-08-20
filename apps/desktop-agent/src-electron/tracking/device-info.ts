import os from "os";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import Store from "electron-store";

type IdentityState = {
  stableDeviceId?: string;
  hardwareFingerprint?: string;
};

const identityStore = new Store<IdentityState>({ name: "device-identity" });

function readPhysicalMachineId(): string | null {
  try {
    if (process.platform === "darwin") {
      const output = execFileSync(
        "/usr/sbin/ioreg",
        ["-rd1", "-c", "IOPlatformExpertDevice"],
        { encoding: "utf8", timeout: 5_000 },
      );
      return output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1] || null;
    }

    if (process.platform === "win32") {
      const output = execFileSync(
        "reg.exe",
        [
          "QUERY",
          "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
          "/v",
          "MachineGuid",
        ],
        { encoding: "utf8", windowsHide: true, timeout: 5_000 },
      );
      return (
        output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim() || null
      );
    }

    return readFileSync("/etc/machine-id", "utf8").trim() || null;
  } catch {
    return null;
  }
}

function hashIdentity(value: string) {
  return createHash("sha256")
    .update(`prosync-workforce:${value.trim().toLowerCase()}`)
    .digest("hex");
}

function resolveIdentity(): IdentityState {
  const physicalId = readPhysicalMachineId();
  if (physicalId) {
    const hardwareFingerprint = hashIdentity(physicalId);
    const stableDeviceId = `device-${hardwareFingerprint.slice(0, 32)}`;
    identityStore.set({ hardwareFingerprint, stableDeviceId });
    return { hardwareFingerprint, stableDeviceId };
  }

  const existing = identityStore.store;
  if (existing.stableDeviceId) return existing;

  const stableDeviceId = `device-${hashIdentity(os.hostname()).slice(0, 32)}`;
  identityStore.set("stableDeviceId", stableDeviceId);
  return { stableDeviceId };
}

let cachedIdentity: IdentityState | null = null;

// Persisted installation identity. Hostnames can change on macOS and using
// employee IDs elsewhere caused one physical Mac to appear as new devices.
export function getDeviceId(): string {
  cachedIdentity ||= resolveIdentity();
  return cachedIdentity.stableDeviceId!;
}

export function getDeviceMeta() {
  cachedIdentity ||= resolveIdentity();
  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    platform: os.platform(),
    agentVersion: process.env.npm_package_version || "unknown",
    hardwareFingerprint: cachedIdentity.hardwareFingerprint || null,
  };
}
