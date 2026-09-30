import { API_BASE_URL as CONFIGURED_API_URL } from "../config";
import axios from "axios";
import { authStore } from "../store/auth.store";
import { getDeviceId } from "./device-info";

const API_BASE_URL = CONFIGURED_API_URL;

export class DeviceErrorLogger {
  static async logError(errorType: string, error: any) {
    try {
      const token = authStore.get("token");
      const user = authStore.get("user");
      const deviceId = getDeviceId();

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const stackTrace = error instanceof Error ? error.stack : undefined;

      const payload = {
        deviceId,
        employeeId: user?.employeeId,
        errorType,
        errorMessage,
        stackTrace,
      };

      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      await axios.post(`${API_BASE_URL}/devices/errors`, payload, {
        headers,
        timeout: 10_000,
      });
    } catch (err) {
      console.error("[DeviceErrorLogger] Failed to post error to backend", err);
    }
  }

  static async logEvent(eventType: string, message: string, details?: any) {
    const detailText =
      details === undefined
        ? ""
        : `\n${JSON.stringify(details, null, 2).slice(0, 4000)}`;
    return this.logError(
      `desktop_lifecycle_${eventType}`,
      new Error(`${message}${detailText}`),
    );
  }
}
