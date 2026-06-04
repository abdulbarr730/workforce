import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  saveAuth: (token: string, user: unknown) =>
    ipcRenderer.invoke("auth:save", token, user),
  getAuth: () => ipcRenderer.invoke("auth:get"),
  clearAuth: () => ipcRenderer.invoke("auth:clear"),
  getTrackingState: () => ipcRenderer.invoke("tracking:getState"),
  sendIdleResponse: (isWorking: boolean, reason?: string) => ipcRenderer.send("idle-response", isWorking, reason),
  startTracking: () => ipcRenderer.invoke("tracking:start"),
  stopTracking: () => ipcRenderer.invoke("tracking:stop"),
  getDeviceId: () => ipcRenderer.invoke("device:getId"),
});
