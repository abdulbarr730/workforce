import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

import type { ReactNode } from "react";

import type { User } from "../types/auth.types";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "https://api.prosyncedu.com/api";

const notifyEmployee = (
  title: string,
  body: string,
  type?: "reminder" | "crm" | "assigned_task",
  meta?: any,
) => {
  const electronApi = (window as any).electronAPI;
  if (electronApi?.showNotification) {
    electronApi.showNotification({
      title,
      body,
      action:
        type === "crm" || type === "assigned_task"
          ? "navigate:assigned-tasks"
          : "navigate:todos",
      type: type || "reminder",
      meta,
      persistent: true,
    });
  } else {
    window.dispatchEvent(
      new CustomEvent("trigger-persistent-alert", {
        detail: {
          title,
          body,
          type: type || "reminder",
          action:
            type === "crm" || type === "assigned_task"
              ? "navigate:assigned-tasks"
              : "navigate:todos",
          meta,
        },
      }),
    );
  }
};

interface AuthContextType {
  token: string | null;

  user: User | null;

  loading: boolean;

  login: (token: string, user: User) => Promise<void>;

  logout: (reason?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const auth = await window.electronAPI.getAuth();

        if (auth.token && auth.user) {
          setToken(auth.token);

          setUser(auth.user as User);
        }
      } catch (error) {
        console.error("Failed to restore auth session", error);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (token: string, user: User) => {
    setToken(token);

    setUser(user);

    await window.electronAPI.saveAuth(token, user);
  };

  const logout = async (reason?: string) => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("eod_draft");
    localStorage.removeItem("todo_draft");
    await window.electronAPI.clearAuth(reason);
  };

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.warn("[AuthContext] Caught 401 Unauthorized, logging out.");
          logout("AUTH_FAILURE");
        }
        return Promise.reject(error);
      },
    );
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  useEffect(() => {
    if (window.electronAPI.onForceLogout) {
      window.electronAPI.onForceLogout(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem("eod_draft");
        localStorage.removeItem("todo_draft");
        window.electronAPI.clearAuth("AUTH_FAILURE");
      });
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
    const source = new EventSource(
      `${API_BASE}/notifications/stream?token=${encodeURIComponent(token)}`,
    );

    const handleAssignedTask = (event: Event) => {
      let payload: any = {};
      try {
        payload = JSON.parse((event as MessageEvent<string>).data);
      } catch {}
      const task = payload.task || {};
      notifyEmployee(
        payload.title || "Assigned task updated",
        payload.message || task.title || "Your assigned task list was updated.",
        task.source === "CRM" ? "crm" : "assigned_task",
        {
          taskId: task.id || task._id,
          queryId: task.crmQueryId,
          clientName: task.crmClientName,
          clientPhone: task.crmClientPhone,
          clientEmail: task.crmClientEmail,
          crmUrl: task.crmUrl,
        },
      );
      window.dispatchEvent(new CustomEvent("assigned-tasks-updated"));
    };

    const handleCrmQueryTransferred = (event: Event) => {
      let payload: any = {};
      try {
        payload = JSON.parse((event as MessageEvent<string>).data);
      } catch {}
      const task = payload.task || {};
      notifyEmployee(
        payload.title || "🔔 CRM Query Transferred",
        payload.message ||
          `Query '${task.title || payload.queryId}' transferred to you from CRM`,
        "crm",
        {
          taskId: task.id || task._id,
          queryId: payload.queryId || task.crmQueryId,
          clientName: payload.clientName || task.crmClientName,
          clientPhone: payload.clientPhone || task.crmClientPhone,
          clientEmail: payload.clientEmail || task.crmClientEmail,
          crmUrl: payload.crmUrl || task.crmUrl,
        },
      );
      window.dispatchEvent(new CustomEvent("assigned-tasks-updated"));
    };

    source.addEventListener("assigned_task_created", handleAssignedTask);
    source.addEventListener("assigned_task_updated", handleAssignedTask);
    source.addEventListener("crm_query_transferred", handleCrmQueryTransferred);
    return () => {
      source.removeEventListener("assigned_task_created", handleAssignedTask);
      source.removeEventListener("assigned_task_updated", handleAssignedTask);
      source.removeEventListener("crm_query_transferred", handleCrmQueryTransferred);
      source.close();
    };
  }, [token]);

  if (loading) {
    return null;
  }

  return (
    <AuthContext.Provider
      value={{
        token,

        user,

        loading,

        login,

        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
};
