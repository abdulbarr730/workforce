import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

export const TodoModal = React.memo(
  ({ token, onClose }: { token: string; onClose: () => void }) => {
    const [tasks, setTasks] = useState<
      { id: string; text: string; done: boolean }[]
    >([{ id: crypto.randomUUID(), text: "", done: false }]);
    const [loading, setLoading] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const showError = (msg: string) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 3000);
    };

    useEffect(() => {
      axios
        .get(`${import.meta.env.VITE_API_BASE_URL}/me/todos/today`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((r) => {
          const existing = r.data?.data?.items;
          if (Array.isArray(existing) && existing.length > 0) {
            setTasks(
              existing.map((t: any) => ({
                ...t,
                id: t.id || crypto.randomUUID(),
              })),
            );
          }
        })
        .catch(() => {});
    }, [token]);

    const handleAddRow = () => {
      setTasks((prev) => {
        const next = [
          ...prev,
          { id: crypto.randomUUID(), text: "", done: false },
        ];
        setTimeout(() => {
          if (inputRefs.current[next.length - 1]) {
            inputRefs.current[next.length - 1]?.focus();
          }
        }, 10);
        return next;
      });
    };

    const handleReset = () => {
      if (!resetConfirm) {
        setResetConfirm(true);
        setTimeout(() => setResetConfirm(false), 3000);
        return;
      }
      setTasks([{ id: crypto.randomUUID(), text: "", done: false }]);
      setResetConfirm(false);
    };

    const processTableData = (text: string) => {
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 1) return;

      const parsedRows = lines
        .map((line) => {
          const cols = line.split(/\t|,/);
          return { id: crypto.randomUUID(), text: cols[0].trim(), done: false };
        })
        .filter((r) => r.text);

      if (parsedRows.length > 0) {
        if (
          parsedRows[0].text.toLowerCase() === "task" ||
          parsedRows[0].text.toLowerCase() === "description"
        ) {
          parsedRows.shift();
        }
        setTasks((prev) => {
          const keep = prev.filter((p) => p.text.trim() !== "");
          return [...keep, ...parsedRows];
        });
      }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("Text");
      if (text) {
        e.preventDefault();
        processTableData(text);
      }
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const text = e.dataTransfer.getData("Text");
      if (text) processTableData(text);
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
    };

    const handleUpdate = (index: number, text: string) => {
      const newTasks = [...tasks];
      newTasks[index] = { ...newTasks[index], text };
      setTasks(newTasks);
    };

    const handleKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>,
      index: number,
    ) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (index === tasks.length - 1) {
          handleAddRow();
        } else {
          inputRefs.current[index + 1]?.focus();
        }
      }
    };

    const handleSubmit = async () => {
      const valid = tasks.filter((t) => t.text.trim().length > 0);
      if (valid.length === 0)
        return showError("Please enter at least one task");

      setLoading(true);
      try {
        await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/me/todos`,
          { items: valid },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        onClose();
      } catch (err) {
        showError("Failed to submit Todo list");
      } finally {
        setLoading(false);
      }
    };

    const previewText = tasks
      .filter((t) => t.text.trim().length > 0)
      .map((t) => `[ ] ${t.text.trim()}`)
      .join("\n");

    const handleCopy = () => {
      if (!previewText) return;
      navigator.clipboard.writeText(previewText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      >
        <div
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 12,
            width: 800,
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            display: "flex",
            gap: 32,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#0f172a" }}>
              📝 Start of Day: To-Do List
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
              Please list your tasks for today. You can <b>Paste</b> or{" "}
              <b>Drop</b> a list here. Press <b>Enter</b> to add a new task.
            </p>

            {errorMsg && (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#ef4444",
                  padding: "8px 12px",
                  borderRadius: 6,
                  marginBottom: 16,
                  fontSize: 13,
                }}
              >
                {errorMsg}
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: 16,
                maxHeight: "50vh",
                overflowY: "auto",
                paddingRight: 8,
              }}
            >
              {tasks.map((task, i) => (
                <input
                  key={task.id}
                  ref={(el) => (inputRefs.current[i] = el)}
                  value={task.text}
                  onChange={(e) => handleUpdate(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  placeholder={`Task ${i + 1}`}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              ))}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  onClick={handleAddRow}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#3b82f6",
                    fontSize: 13,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  + Add another task
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    background: "none",
                    border: "none",
                    color: resetConfirm ? "red" : "#ef4444",
                    fontSize: 13,
                    cursor: "pointer",
                    padding: 0,
                    fontWeight: resetConfirm ? "bold" : "normal",
                  }}
                >
                  {resetConfirm ? "Click to confirm reset" : "Reset list"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: "auto" }}>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 8,
                  background: "#10b981",
                  color: "#fff",
                  border: "none",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {loading ? "Saving..." : "Save To-Do List"}
              </button>
              <button
                onClick={onClose}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#64748b",
                  border: "none",
                  cursor: "pointer",
                  marginTop: 8,
                }}
              >
                Close
              </button>
            </div>
          </div>

          {/* Live Preview Column */}
          <div
            style={{
              width: 300,
              background: "#f8fafc",
              padding: 20,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: "#334155",
                  fontWeight: 600,
                }}
              >
                Live Preview
              </h3>
              <button
                onClick={handleCopy}
                disabled={!previewText}
                style={{
                  background: copied ? "#10b981" : "#fff",
                  color: copied ? "#fff" : "#3b82f6",
                  border: `1px solid ${copied ? "#10b981" : "#cbd5e1"}`,
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: previewText ? "pointer" : "not-allowed",
                  opacity: previewText ? 1 : 0.5,
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
              >
                {copied ? "✓ Copied" : "Copy List"}
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                background: "#fff",
                padding: 12,
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                fontSize: 13,
                color: "#475569",
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
              }}
            >
              {previewText || (
                <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                  No tasks entered yet...
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
