import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

import type { ReactNode } from "react";

import type { User } from "../types/auth.types";

interface AuthContextType {
  token: string | null;

  user: User | null;

  loading: boolean;

  login: (token: string, user: User) => Promise<void>;

  logout: () => Promise<void>;
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

  const logout = async () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("eod_draft");
    localStorage.removeItem("todo_draft");
    await window.electronAPI.clearAuth();
  };

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.warn("[AuthContext] Caught 401 Unauthorized, logging out.");
          logout();
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
        window.electronAPI.clearAuth();
      });
    }
  }, []);

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
