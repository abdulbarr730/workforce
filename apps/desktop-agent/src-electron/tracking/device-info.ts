import os from "os";
import { authStore } from "../store/auth.store";
import crypto from "crypto";

// Generates or retrieves a stable unique device ID persisted to disk
export function getDeviceId(): string {
  let id = authStore.get("deviceId" as any) as string | undefined;
  if (!id) {
    id = `${os.hostname()}-${crypto.randomUUID().slice(0, 8)}`;
    (authStore as any).set("deviceId", id);
  }
  return id;
}

export function getDeviceMeta() {
  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    platform: os.platform(),
    agentVersion: "1.0.0",
  };
}
