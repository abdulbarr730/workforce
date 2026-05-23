import {
  contextBridge,
  ipcRenderer
} from "electron";

contextBridge.exposeInMainWorld(
  "electronAPI",

  {
    saveAuth: (
      token: string,
      user: unknown
    ) =>
      ipcRenderer.invoke(
        "auth:save",
        token,
        user
      ),

    getAuth: () =>
      ipcRenderer.invoke(
        "auth:get"
      ),

    clearAuth: () =>
      ipcRenderer.invoke(
        "auth:clear"
      )
  }
);