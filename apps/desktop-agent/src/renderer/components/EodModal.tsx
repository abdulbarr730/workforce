import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

export const formatToHHMM = (val: string) => {
  if (!val) return val;
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (val.includes(":")) return val;
  if (val.toLowerCase().includes("h") || val.toLowerCase().includes("m"))
    return val;

  const totalMinutes = Math.round(num * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

export const parseTimeToMinutes = (val: string): number => {
  if (!val) return 0;
  let str = val.toLowerCase().trim();
  let totalMins = 0;

  if (str.includes("h") || str.includes("m")) {
    const hMatch = str.match(/([\d.]+)\s*h/);
    const mMatch = str.match(/([\d.]+)\s*m/);
    if (hMatch) totalMins += parseFloat(hMatch[1]) * 60;
    if (mMatch) totalMins += parseFloat(mMatch[1]);
    return Math.round(totalMins);
  }

  if (str.includes(":")) {
    const parts = str.split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return Math.round(h * 60 + m);
  }

  const num = parseFloat(str);
  if (!isNaN(num)) {
    return Math.round(num * 60);
  }
  return 0;
};

export const EodModal = React.memo(
  ({
    token,
    onClose,
    onSubmitSuccess,
    onSignOut,
  }: {
    token: string;
    onClose: () => void;
    onSubmitSuccess?: () => void;
    onSignOut: () => void;
  }) => {
    const getTodayStr = () => new Date().toISOString().split("T")[0];

    const [rows, setRows] = useState<
      { id: string; task: string; hours: string; isTopTask?: boolean }[]
    >(() => {
      const saved = localStorage.getItem("eod_draft_v2");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.date === getTodayStr() && Array.isArray(parsed.rows)) {
            return parsed.rows.map((r: any) => ({
              ...r,
              id: r.id || crypto.randomUUID(),
              hours: formatToHHMM(r.hours || ""),
              isTopTask: !!r.isTopTask,
              sourceTodoText: r.sourceTodoText,
            }));
          }
        } catch (e) {}
      }
      const legacySaved = localStorage.getItem("eod_draft");
      if (legacySaved) {
        localStorage.removeItem("eod_draft");
      }
      return [
        { id: crypto.randomUUID(), task: "", hours: "", isTopTask: false },
      ];
    });

    const [loading, setLoading] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [submitConfirm, setSubmitConfirm] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);
    const [todoItems, setTodoItems] = useState<{ text: string }[]>([]);

    const taskRefs = useRef<(HTMLInputElement | null)[]>([]);
    const hoursRefs = useRef<(HTMLInputElement | null)[]>([]);

    const showError = (msg: string) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 3000);
    };

    useEffect(() => {
      localStorage.setItem(
        "eod_draft_v2",
        JSON.stringify({ date: getTodayStr(), rows }),
      );
    }, [rows]);

    useEffect(() => {
      const fetchExistingEod = async () => {
        try {
          const res = await axios.get(
            `${import.meta.env.VITE_API_BASE_URL}/me/eod/today`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.data?.data?.completedItems) {
            const items = res.data.data.completedItems as string[];
            const top3 = res.data.data.top3Tasks || [];
            const newRows = items.map((item) => {
              let taskObj: any = { task: item, hours: "", isTopTask: false };
              const oldMatch = item.match(/^(.*) \(([\d.]+)h\)$/);
              if (oldMatch) {
                taskObj = {
                  task: oldMatch[1],
                  hours: oldMatch[2],
                  isTopTask: top3.includes(oldMatch[1]),
                };
              } else {
                const newMatch = item.match(/^(.*) - (.*)$/);
                if (newMatch) {
                  taskObj = {
                    task: newMatch[1],
                    hours: newMatch[2],
                    isTopTask: top3.includes(newMatch[1]),
                  };
                } else {
                  taskObj.isTopTask = top3.includes(item);
                }
              }
              return { ...taskObj, id: crypto.randomUUID() };
            });
            if (newRows.length > 0) {
              setRows(newRows);
            }
          }
        } catch (err) {
          // Silently ignore if no EOD exists or error
        }

        try {
          const todoRes = await axios.get(
            `${import.meta.env.VITE_API_BASE_URL}/me/todos/today`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (todoRes.data?.data?.items) {
            setTodoItems(todoRes.data.data.items);
          }
        } catch (err) {}
      };
      fetchExistingEod();
    }, [token]);

    const handleAddRow = () => {
      setRows((prev) => {
        const next = [
          ...prev,
          { id: crypto.randomUUID(), task: "", hours: "02:00", isTopTask: false },
        ];
        setTimeout(() => {
          if (taskRefs.current[next.length - 1]) {
            taskRefs.current[next.length - 1]?.focus();
          }
        }, 10);
        return next;
      });
    };

    const autoCalculateTimestamps = () => {
      const todayStr = getTodayStr();
      const loginKey = `workforce_login_time_${todayStr}`;
      const loginTs = localStorage.getItem(loginKey);
      const loginTime = loginTs
        ? parseInt(loginTs, 10)
        : Date.now() - rows.length * 2 * 3600 * 1000;
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

      const updated = rows.map((r, idx) => {
        // If row already has a specific custom timing or hours, preserve it!
        const hasExistingHours = r.hours && r.hours.trim() !== "";
        const hasExistingStamp =
          /\(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:–|-|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\)/i.test(
            r.task,
          );

        if (hasExistingHours && hasExistingStamp) {
          return r; // Ignore and keep unchanged
        }

        const startMs = loginTime + idx * TWO_HOURS_MS;
        const endMs = startMs + TWO_HOURS_MS;
        const startStr = new Date(startMs).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const endStr = new Date(endMs).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        let taskName = r.task.trim();
        if (!hasExistingStamp && taskName) {
          taskName = `${taskName} (${startStr} – ${endStr})`;
        }
        return {
          ...r,
          task: taskName,
          hours: hasExistingHours ? r.hours : "02:00",
        };
      });

      setRows(updated);
    };

    const handleReset = () => {
      if (!resetConfirm) {
        setResetConfirm(true);
        setTimeout(() => setResetConfirm(false), 3000);
        return;
      }
      setRows([
        { id: crypto.randomUUID(), task: "", hours: "", isTopTask: false },
      ]);
      localStorage.removeItem("eod_draft_v2");
      setResetConfirm(false);
    };

    const handleUpdate = (
      index: number,
      field: "task" | "hours" | "isTopTask",
      value: string | boolean,
    ) => {
      const newRows = [...rows];

      if (field === "isTopTask" && value === true) {
        const topCount = newRows.filter((r) => r.isTopTask).length;
        if (topCount >= 3) {
          showError("You can only select up to 3 top tasks.");
          return;
        }
      }

      newRows[index] = { ...newRows[index], [field]: value };
      setRows(newRows);
    };

    const combineTasks = (
      prevRows: {
        id: string;
        task: string;
        hours: string;
        isTopTask?: boolean;
      }[],
      newRows: { task: string; hours: string; isTopTask?: boolean }[],
    ) => {
      const validPrev = prevRows.filter((p) => p.task.trim() !== "");
      return [
        ...validPrev,
        ...newRows.map((r) => ({ ...r, id: crypto.randomUUID() })),
      ];
    };

    const processTableData = (text: string) => {
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 1) return;

      const parsedRows = lines
        .map((line) => {
          let cols = line.split("\t");
          if (cols.length < 2) {
            cols = line.split(/ {2,}/);
          }
          if (cols.length >= 2) {
            const hoursPart = formatToHHMM(cols[cols.length - 1].trim());
            const taskPart = cols
              .slice(0, cols.length - 1)
              .join(" ")
              .trim();
            return { task: taskPart, hours: hoursPart };
          } else if (cols.length === 1) {
            return { task: cols[0].trim(), hours: "" };
          }
          return null;
        })
        .filter((r) => r && r.task) as { task: string; hours: string }[];

      if (parsedRows.length > 0) {
        if (
          parsedRows[0].task.toLowerCase() === "task" ||
          parsedRows[0].task.toLowerCase() === "description"
        ) {
          parsedRows.shift();
        }
        setRows((prev) => combineTasks(prev, parsedRows));
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
      const file = e.dataTransfer.files?.[0];
      if (
        file &&
        (file.name.endsWith(".xlsx") ||
          file.name.endsWith(".xls") ||
          file.name.endsWith(".csv"))
      ) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: "binary" });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

            const parsedRows: { task: string; hours: string }[] = [];
            for (let i = 0; i < data.length; i++) {
              const row = data[i] as string[];
              if (!row || row.length === 0) continue;
              if (
                i === 0 &&
                row.length > 0 &&
                String(row[0]).toLowerCase().includes("task")
              )
                continue;

              const task = String(row[0] || "");
              const hours =
                row.length > 1 ? formatToHHMM(String(row[1] || "").trim()) : "";
              if (task.trim()) {
                parsedRows.push({ task, hours });
              }
            }

            if (parsedRows.length > 0) {
              setRows((prev) => combineTasks(prev, parsedRows));
            }
          } catch (err) {
            showError("Failed to parse dropped Excel file.");
          }
        };
        reader.readAsBinaryString(file);
      } else {
        const text = e.dataTransfer.getData("Text");
        if (text) processTableData(text);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: "binary" });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

          const parsedRows: { task: string; hours: string }[] = [];
          for (let i = 0; i < data.length; i++) {
            const row = data[i] as string[];
            if (!row || row.length === 0) continue;
            if (
              i === 0 &&
              row.length > 0 &&
              String(row[0]).toLowerCase().includes("task")
            )
              continue;

            const task = String(row[0] || "");
            const hours =
              row.length > 1 ? formatToHHMM(String(row[1] || "").trim()) : "";
            if (task.trim()) {
              parsedRows.push({ task, hours });
            }
          }

          if (parsedRows.length > 0) {
            setRows((prev) => combineTasks(prev, parsedRows));
          } else {
            showError("Could not extract tasks and hours from the Excel file.");
          }
        } catch (err) {
          showError("Failed to parse Excel file.");
        }
      };
      reader.readAsBinaryString(file);
    };

    const handleTaskKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>,
      index: number,
    ) => {
      if (e.key === "Enter") {
        e.preventDefault();
        hoursRefs.current[index]?.focus();
      }
    };

    const handleHoursKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>,
      index: number,
    ) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (index === rows.length - 1) {
          handleAddRow();
        } else {
          taskRefs.current[index + 1]?.focus();
        }
      }
    };

    const handleSubmit = async () => {
      const valid = rows.filter((r) => r.task.trim().length > 0);
      if (valid.length < 3) {
        return showError(
          "Please enter at least Top 3 tasks for your daily final submission.",
        );
      }

      const missingHours = valid.some(
        (r) => !r.hours || r.hours.trim() === "",
      );
      if (missingHours) {
        return showError(
          "Time duration is mandatory for all tasks! (e.g. 1h 30m, 45m, 2h)",
        );
      }

      if (!submitConfirm) {
        setSubmitConfirm(true);
        setTimeout(() => setSubmitConfirm(false), 3000);
        return;
      }

      const completedItems = valid.map((r) => {
        if (r.hours && r.hours.trim() !== "") {
          return `${r.task} - ${r.hours.trim()}`;
        }
        return r.task;
      });

      let computedTopTasks = valid
        .filter((r) => r.isTopTask)
        .map((r) => r.task);

      if (computedTopTasks.length === 0) {
        computedTopTasks = valid.slice(0, 3).map((r) => r.task);
      }

      setLoading(true);
      try {
        await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/me/eod`,
          {
            summary: "End of Day submission",
            completedItems,
            top3Tasks: computedTopTasks,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        localStorage.removeItem("eod_draft_v2");
        setSubmitConfirm(false);

        if (onSubmitSuccess) onSubmitSuccess();
        onClose();
      } catch (err) {
        showError("Failed to submit EOD");
      } finally {
        setLoading(false);
      }
    };

    const generatePreview = () => {
      const validRows = rows.filter((r) => r.task.trim().length > 0);
      if (validRows.length === 0) return "";

      const topTasks = validRows.filter((r) => r.isTopTask);
      const completedTasks = validRows; // Some people might want non-top tasks, but EOD usually lists all.

      let text = "";
      if (topTasks.length > 0) {
        text += "Top Tasks:\n";
        topTasks.forEach((t, i) => {
          text += `${i + 1}. ${t.task}\n`;
        });
        text += "\n";
      }

      text += "Completed Today:\n";
      completedTasks.forEach((t) => {
        const hrs = t.hours.trim() ? ` - ${t.hours}` : "";
        text += `- ${t.task}${hrs}\n`;
      });

      return text.trim();
    };

    const previewText = generatePreview();

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
            width: 900,
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            maxHeight: "90vh",
            display: "flex",
            gap: 32,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#0f172a" }}>
              🌙 End of Day Submission
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
              Log tasks throughout the day. It auto-saves. <br />
              <b>Paste / Drop a table</b> anywhere here. Press <b>Enter</b> to
              navigate.
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

            <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
              <label
                style={{
                  display: "inline-block",
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#475569",
                  cursor: "pointer",
                  border: "1px dashed #cbd5e1",
                }}
              >
                📁 Upload Excel (.xlsx)
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </label>
              <button
                type="button"
                onClick={autoCalculateTimestamps}
                style={{
                  padding: "8px 12px",
                  background: "rgba(99,102,241,0.1)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#6366f1",
                  cursor: "pointer",
                }}
                title="Automatically calculates 2-hour timestamps and durations from login time"
              >
                ⏱️ Auto-Calculate Timestamps
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                marginBottom: 16,
                paddingRight: 8,
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "8px 4px",
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: 600,
                        width: 48,
                      }}
                      title="Select Top 3 Tasks (Mandatory)"
                    >
                      Top 3
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 0",
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      Task Description *
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 0",
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: 600,
                        width: 150,
                      }}
                    >
                      Time (e.g. 10:00-11:15 or 45m) *
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id}>
                      <td style={{ padding: "6px 4px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={!!row.isTopTask}
                          onChange={(e) =>
                            handleUpdate(i, "isTopTask", e.target.checked)
                          }
                          style={{
                            cursor: "pointer",
                            width: 16,
                            height: 16,
                            accentColor: "#3b82f6",
                          }}
                        />
                      </td>
                      <td style={{ padding: "6px 4px 6px 0" }}>
                        <input
                          ref={(el) => {
                            taskRefs.current[i] = el;
                          }}
                          value={row.task || ""}
                          onChange={(e) =>
                            handleUpdate(i, "task", e.target.value)
                          }
                          onKeyDown={(e) => handleTaskKeyDown(e, i)}
                          placeholder="e.g. Built Analytics dashboard"
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: 6,
                            border: "1px solid #cbd5e1",
                            fontSize: 13,
                            boxSizing: "border-box",
                          }}
                        />
                      </td>
                      <td style={{ padding: "6px 0 6px 4px" }}>
                        <input
                          ref={(el) => {
                            hoursRefs.current[i] = el;
                          }}
                          type="text"
                          value={row.hours || ""}
                          onChange={(e) =>
                            handleUpdate(i, "hours", e.target.value)
                          }
                          onBlur={() =>
                            handleUpdate(i, "hours", formatToHHMM(row.hours))
                          }
                          onKeyDown={(e) => handleHoursKeyDown(e, i)}
                          placeholder="e.g. 10:00-11:15 or 45m"
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: 6,
                            border: "1px solid #cbd5e1",
                            fontSize: 13,
                            boxSizing: "border-box",
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 8,
                }}
              >
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
                  + Add another row
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
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #cbd5e1", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Total Tracked Time:</span>
                <span style={{ fontSize: 16, color: "#0f172a", fontWeight: 700 }}>
                  {(() => {
                    const totalMins = rows.reduce((acc, r) => acc + parseTimeToMinutes(r.hours), 0);
                    const h = Math.floor(totalMins / 60);
                    const m = totalMins % 60;
                    return `${h}h ${m}m`;
                  })()}
                </span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                Draft auto-saved locally.
              </span>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={onClose}
                  disabled={loading}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 8,
                    background: "#f1f5f9",
                    color: "#475569",
                    border: "none",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 8,
                    background: submitConfirm ? "#22c55e" : "#3b82f6",
                    color: "#fff",
                    border: "none",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {loading
                    ? "Submitting..."
                    : submitConfirm
                      ? "Click to Confirm"
                      : "Submit Final EOD"}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div
            style={{
              width: 320,
              background: "#f8fafc",
              padding: 20,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {todoItems.length > 0 && (
              <div
                style={{
                  marginBottom: 20,
                  background: "#fff",
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    margin: "0 0 10px",
                    color: "#334155",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  📝 Select tasks from today's To-Do
                </h3>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {todoItems.map((todo, idx) => {
                    const isChecked = rows.some(
                      (r: any) =>
                        r.sourceTodoText === todo.text || r.task === todo.text,
                    );
                    return (
                      <label
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          fontSize: 13,
                          color: "#475569",
                          cursor: "pointer",
                          padding: "4px 0",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRows((prev) => {
                                if (
                                  prev.some(
                                    (r: any) =>
                                      r.sourceTodoText === todo.text ||
                                      r.task === todo.text,
                                  )
                                )
                                  return prev;
                                const validRows = prev.filter(
                                  (r) =>
                                    r.task.trim() !== "" ||
                                    r.hours.trim() !== "",
                                );
                                return [
                                  ...validRows,
                                  {
                                    id: crypto.randomUUID(),
                                    task: todo.text,
                                    hours: "",
                                    isTopTask: false,
                                    sourceTodoText: todo.text,
                                  } as any,
                                ];
                              });
                            } else {
                              setRows((prev) => {
                                const next = prev.filter(
                                  (r: any) =>
                                    r.sourceTodoText !== todo.text &&
                                    r.task !== todo.text,
                                );
                                if (next.length === 0)
                                  return [
                                    {
                                      id: crypto.randomUUID(),
                                      task: "",
                                      hours: "",
                                      isTopTask: false,
                                    },
                                  ];
                                return next;
                              });
                            }
                          }}
                          style={{
                            marginTop: 2,
                            accentColor: "#3b82f6",
                            width: 16,
                            height: 16,
                            cursor: "pointer",
                          }}
                        />
                        <span style={{ lineHeight: 1.4 }}>{todo.text}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

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
                {copied ? "✓ Copied" : "Copy Report"}
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
