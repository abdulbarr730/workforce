import React from "react";

interface Segment {
  start: string;
  end: string;
  durationSecs: number;
  type: string;
}

export const SegmentsModal = React.memo(
  ({
    type,
    segments,
    onClose,
  }: {
    type: "BREAK" | "OFFLINE";
    segments: Segment[];
    onClose: () => void;
  }) => {
    const filteredSegments = segments.filter((s) => s.type === type);

    const totalSecs = filteredSegments.reduce(
      (acc, s) => acc + s.durationSecs,
      0,
    );
    const totalMins = Math.round(totalSecs / 60);

    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: 20,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            width: "100%",
            maxWidth: 500,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            boxShadow:
              "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {type === "BREAK" ? "Break Time Log" : "Offline Work Log"}
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                Total: {totalMins} minutes ({filteredSegments.length} sessions)
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 24,
                color: "#94a3b8",
                cursor: "pointer",
                padding: "0 8px",
                borderRadius: 6,
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
            {filteredSegments.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#94a3b8",
                  padding: "40px 0",
                }}
              >
                <p style={{ margin: 0, fontSize: 14 }}>
                  No {type === "BREAK" ? "breaks" : "offline work"} recorded
                  today.
                </p>
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {filteredSegments.map((seg, i) => {
                  const sTime = new Date(seg.start).toLocaleTimeString(
                    "en-US",
                    { hour: "numeric", minute: "2-digit" },
                  );
                  const eTime = new Date(seg.end).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  const mins = Math.max(1, Math.round(seg.durationSecs / 60)); // Ensure at least 1 min for tiny breaks

                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "14px 18px",
                        background: type === "BREAK" ? "#fffbeb" : "#f0f9ff",
                        border: `1px solid ${type === "BREAK" ? "#fef3c7" : "#e0f2fe"}`,
                        borderRadius: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background:
                              type === "BREAK" ? "#f59e0b" : "#0ea5e9",
                            boxShadow: `0 0 0 3px ${type === "BREAK" ? "#fef3c7" : "#e0f2fe"}`,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#334155",
                          }}
                        >
                          {sTime} - {eTime}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: type === "BREAK" ? "#d97706" : "#0284c7",
                          background: type === "BREAK" ? "#fef3c7" : "#e0f2fe",
                          padding: "4px 10px",
                          borderRadius: 20,
                        }}
                      >
                        {mins} min
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #f1f5f9",
              textAlign: "right",
            }}
          >
            <button
              onClick={onClose}
              style={{
                background: "#f1f5f9",
                color: "#475569",
                border: "1px solid #e2e8f0",
                padding: "10px 24px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#e2e8f0")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#f1f5f9")
              }
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  },
);
