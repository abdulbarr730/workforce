"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

function ResetPasswordInner() {
  const token = useSearchParams()?.get("token") || "";
  const [done, setDone] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        padding: "32px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 19, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
          Set your password
        </h1>
        {!token ? (
          <p style={{ fontSize: 13, color: "#b91c1c" }}>
            This link is not complete. Open the button in your email again, or ask your admin for a new link.
          </p>
        ) : done ? (
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
            <p style={{ color: "#047857", fontWeight: 600 }}>Your password is set.</p>
            <p>Use it to sign in here and in the Workforce Agent.</p>
            <Link href="/login" style={{ color: "#E68A00", fontWeight: 600 }}>
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Choose a new password for your Workforce account. It works in the agent and on the dashboard.
            </p>
            <SetPasswordForm
              onSubmit={async ({ newPassword }) => {
                await api.post("/api/auth/reset-password", { token, newPassword });
                setDone(true);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
