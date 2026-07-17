import axios from "axios";
import { app } from "electron";
import { authStore } from "../store/auth.store";
import { getDeviceId } from "./device-info";

const API_BASE_URL = app.isPackaged
  ? "https://hr.prosyncedu.com/api"
  : "http://localhost:5000/api";

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

      await axios.post(`${API_BASE_URL}/devices/errors`, payload, { headers });
    } catch (err) {
      console.error("[DeviceErrorLogger] Failed to post error to backend", err);
    }
  }
}
