import { useState } from "react";

import { useNavigate } from "react-router-dom";

import { Eye, EyeOff } from "lucide-react";

import { api } from "../api/axios";

import { useAuth } from "../auth/AuthContext";

import type { LoginResponse } from "../types/auth.types";

declare global {
  interface Window {
    electronAPI: {
      saveAuth: (token: string, user: unknown) => Promise<boolean>;

      getAuth: () => Promise<{
        token: string;
        user: unknown;
      }>;

      clearAuth: () => Promise<boolean>;
      getDeviceId: () => Promise<string>;
    };
  }
}

export const LoginPage = () => {
  const navigate = useNavigate();

  const { login } = useAuth();

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);

      const deviceId = await window.electronAPI.getDeviceId();

      const response = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
        deviceId,
      });

      const token = response.data.data.token;

      const user = response.data.data.user;

      /*
            Save auth into
            electron-store
          */
      await window.electronAPI.saveAuth(token, user);

      /*
            Save auth into
            React context
          */
      await login(token, user);

      navigate("/");
    } catch (error) {
      console.error(error);

      alert("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#f3f4f6] px-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-10 shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-lg font-bold text-black">
              W
            </div>

            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Workforce</h1>

              <p className="text-sm text-zinc-500">Workforce Intelligence</p>
            </div>
          </div>

          <p className="mt-6 text-sm leading-6 text-zinc-600">
            Secure employee activity monitoring and productivity analytics
            platform.
          </p>
        </div>

        <div className="space-y-5">
          <input
            type="email"
            placeholder="Enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-zinc-300 bg-white px-5 py-4 text-sm outline-none transition focus:border-amber-500"
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-zinc-300 bg-white px-5 py-4 pr-14 text-sm outline-none transition focus:border-amber-500"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="flex w-full items-center justify-center rounded-2xl bg-amber-500 py-4 text-sm font-semibold text-black transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
};
