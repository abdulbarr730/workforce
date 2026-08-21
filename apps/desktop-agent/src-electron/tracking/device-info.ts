import os from "os";
import { createHash, randomUUID } from "crypto";
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
  const hardwareFingerprint = physicalId ? hashIdentity(physicalId) : undefined;
  const existing = identityStore.store;

  // Preserve the installation ID already used by older agent versions. The
  // previous regression replaced this value whenever hardware information was
  // available, making an ordinary update appear to be a different device.
  if (
    existing.stableDeviceId &&
    (!existing.hardwareFingerprint ||
      !hardwareFingerprint ||
      existing.hardwareFingerprint === hardwareFingerprint)
  ) {
    if (hardwareFingerprint && !existing.hardwareFingerprint) {
      identityStore.set("hardwareFingerprint", hardwareFingerprint);
    }
    return { ...existing, hardwareFingerprint };
  }

  // If a copied OS/profile contains another machine's identity store, create
  // a fresh installation ID instead of allowing two laptops to fight over the
  // same backend device record.
  if (physicalId) {
    const stableDeviceId = `device-${randomUUID()}`;
    identityStore.set({ hardwareFingerprint, stableDeviceId });
    return { hardwareFingerprint, stableDeviceId };
  }

  if (existing.stableDeviceId) return existing;

  const stableDeviceId = `device-${randomUUID()}`;
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

export function rotateConflictingDeviceId(): string {
  cachedIdentity ||= resolveIdentity();
  const stableDeviceId = `device-${randomUUID()}`;
  cachedIdentity = { ...cachedIdentity, stableDeviceId };
  identityStore.set(cachedIdentity);
  return stableDeviceId;
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
