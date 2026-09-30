"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export default function AccountPage() {
  const { user, setAuth } = useAuthStore();
  const [message, setMessage] = useState("");
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My account</h1>
        <p className="text-sm text-slate-500">
          {user?.name} · {user?.email}
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-slate-800">Change password</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          The new password works here and in the Workforce Agent.
        </p>
        {message && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </div>
        )}
        <SetPasswordForm
          key={formKey}
          askCurrent
          submitLabel="Change password"
          onSubmit={async ({ newPassword, currentPassword }) => {
            setMessage("");
            const res = await api.post("/api/auth/change-password", { newPassword, currentPassword });
            const { token, user: updated } = res.data.data;
            if (token && updated) setAuth(updated, token);
            setMessage("Password changed.");
            setFormKey((k) => k + 1);
          }}
        />
      </div>
    </div>
  );
}
