export default function Custom500() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#f8fafc",
        color: "#1e293b",
        padding: "20px",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "36px 28px",
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
          maxWidth: "380px",
          width: "100%",
        }}
      >
        <h1
          style={{
            fontSize: "44px",
            fontWeight: "900",
            color: "#f43f5e",
            margin: 0,
            lineHeight: 1,
          }}
        >
          500
        </h1>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: "700",
            color: "#0f172a",
            margin: "14px 0 6px",
          }}
        >
          Internal Server Error
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: "#64748b",
            margin: "0 0 22px",
            lineHeight: 1.5,
          }}
        >
          An unexpected error occurred on the server. Please try refreshing or return to the command center.
        </p>
        <a
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "9px 20px",
            borderRadius: "9px",
            background: "linear-gradient(135deg,#FF9900,#E68A00)",
            color: "#111827",
            fontSize: "13px",
            fontWeight: "600",
            textDecoration: "none",
            boxShadow: "0 2px 8px rgba(255,153,0,0.25)",
          }}
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}
