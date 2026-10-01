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
      getDeviceMeta: () => Promise<{
        hostname?: string | null;
        os?: string | null;
        platform?: string | null;
        agentVersion?: string | null;
        hardwareFingerprint?: string | null;
      }>;
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

  // One-time password step: the temporary session only allows this.
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finishLogin = async (token: string, user: LoginResponse["data"]["user"]) => {
    await window.electronAPI.saveAuth(token, user);
    await login(token, user);
    navigate("/");
  };

  const handleSetPassword = async () => {
    setError(null);
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Use at least 8 characters with letters and numbers.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }
    try {
      setLoading(true);
      const response = await api.post<LoginResponse>(
        "/auth/change-password",
        { newPassword },
        { headers: { Authorization: `Bearer ${oneTimeToken}` } },
      );
      await finishLogin(response.data.data.token, response.data.data.user);
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          (status === 401 ? "Please sign in again." : "Could not set your password. Try again."),
      );
      if (status === 401) {
        setOneTimeToken(null);
        setPassword("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setError(null);
    try {
      setLoading(true);

      const deviceId = await window.electronAPI.getDeviceId();
      const deviceMeta = await window.electronAPI.getDeviceMeta();

      const response = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
        deviceId,
        deviceMeta,
      });

      const token = response.data.data.token;

      const user = response.data.data.user;

      // One-time password: nothing is saved or tracked until they set
      // their own password (here or on the dashboard - either is enough).
      if (response.data.data.mustChangePassword) {
        setOneTimeToken(token);
        setNewPassword("");
        setConfirmPassword("");
        return;
      }

      await finishLogin(token, user);
    } catch (err: any) {
      console.error(err);

      setError(err?.response?.data?.message || err?.response?.data?.error || "Invalid credentials");
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

        {oneTimeToken ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <p className="font-semibold">Set your own password</p>
              <p className="mt-1">
                You signed in with a one-time password. Choose a new password to continue.
                You won't be asked again on the dashboard.
              </p>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="New password (8+ characters, letters and numbers)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-2xl border border-zinc-300 bg-white px-5 py-4 text-sm outline-none transition focus:border-amber-500"
            />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Type the new password again"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
              className="w-full rounded-2xl border border-zinc-300 bg-white px-5 py-4 text-sm outline-none transition focus:border-amber-500"
            />
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
              Show passwords
            </label>
            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            <button
              onClick={handleSetPassword}
              disabled={loading}
              className="flex w-full items-center justify-center rounded-2xl bg-amber-500 py-4 text-sm font-semibold text-black transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving..." : "Set password and continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOneTimeToken(null);
                setPassword("");
                setError(null);
              }}
              className="w-full text-sm text-zinc-500 hover:text-zinc-700"
            >
              Back to sign in
            </button>
          </div>
        ) : (
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
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
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
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>
        )}
      </div>
    </div>
  );
};
