import os from "os";

// Stable device ID = just the machine hostname. Simple and deterministic.
export function getDeviceId(): string {
  return os.hostname();
}

export function getDeviceMeta() {
  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    platform: os.platform(),
    agentVersion: "1.0.0",
  };
}
