import { create } from "zustand";

interface User {
  employeeId: string;
  name: string;
  email: string;
  role: string;
  department?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  setAuth: (user, token) => {
    localStorage.setItem("wf_token", token);
    localStorage.setItem("wf_user", JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("wf_token");
    localStorage.removeItem("wf_user");
    set({ user: null, token: null, isAuthenticated: false });
  },

  init: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("wf_token");
    const userStr = localStorage.getItem("wf_user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true });
      } catch {
        localStorage.removeItem("wf_token");
        localStorage.removeItem("wf_user");
      }
    }
  },
}));
