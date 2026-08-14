import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  saveAuth: (token: string, user: unknown) =>
    ipcRenderer.invoke("auth:save", token, user),
  getAuth: () => ipcRenderer.invoke("auth:get"),
  clearAuth: (reason?: string) => ipcRenderer.invoke("auth:clear", reason),
  getTrackingState: () => ipcRenderer.invoke("tracking:getState"),
  sendIdleResponse: (isWorking: boolean, reason?: string) =>
    ipcRenderer.send("idle-response", isWorking, reason),
  startTracking: () => ipcRenderer.invoke("tracking:start"),
  stopTracking: () => ipcRenderer.invoke("tracking:stop"),
  getDeviceId: () => ipcRenderer.invoke("device:getId"),
  onForceLogout: (callback: () => void) => {
    ipcRenderer.removeAllListeners("auth:force-logout");
    ipcRenderer.on("auth:force-logout", callback);
  },
  onNewDay: (callback: () => void) => {
    ipcRenderer.removeAllListeners("shift:new-day");
    ipcRenderer.on("shift:new-day", callback);
  },
  onOpenEod: (callback: () => void) => {
    ipcRenderer.removeAllListeners("shift:open-eod");
    ipcRenderer.on("shift:open-eod", callback);
  },
  onSchedulePaused: (callback: () => void) => {
    ipcRenderer.removeAllListeners("tracking:schedule-paused");
    ipcRenderer.on("tracking:schedule-paused", callback);
  },
  onScheduleResumed: (callback: () => void) => {
    ipcRenderer.removeAllListeners("tracking:schedule-resumed");
    ipcRenderer.on("tracking:schedule-resumed", callback);
  },
  onUpdateDownloaded: (callback: (version: string) => void) => {
    ipcRenderer.removeAllListeners("updater:update-downloaded");
    ipcRenderer.on("updater:update-downloaded", (_event, version) =>
      callback(version),
    );
  },
  onUpdateTriggerGlow: (callback: () => void) => {
    ipcRenderer.removeAllListeners("updater:trigger-glow");
    ipcRenderer.on("updater:trigger-glow", () => callback());
  },
  installUpdate: () => ipcRenderer.send("updater:install"),
  showNotification: (options: {
    title: string;
    body: string;
    action?: string;
  }) => ipcRenderer.invoke("notification:show", options),
  showCheckinPrompt: (options: {
    title?: string;
    message?: string;
    detail?: string;
    intervalLabel: string;
  }) => ipcRenderer.invoke("dialog:showCheckinPrompt", options),
  showEodPrompt: (options?: {
    title?: string;
    message?: string;
    detail?: string;
  }) => ipcRenderer.invoke("dialog:showEodPrompt", options || {}),
  openTodoWidget: () => ipcRenderer.invoke("todo-widget:open"),
  closeTodoWidget: () => ipcRenderer.invoke("todo-widget:close"),
  setTodoWidgetExpanded: (expanded: boolean) =>
    ipcRenderer.invoke("todo-widget:set-expanded", expanded),
  onTriggerCheckin: (callback: (data?: any) => void) => {
    ipcRenderer.removeAllListeners("checkin:trigger");
    ipcRenderer.on("checkin:trigger", (_event, data) => callback(data));
  },
});
