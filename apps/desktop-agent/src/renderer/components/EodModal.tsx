import React, { useState, useEffect } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

export const formatToHHMM = (val: string) => {
  if (!val) return val;
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (val.includes(':')) return val;
  if (val.toLowerCase().includes('h') || val.toLowerCase().includes('m')) return val;
  
  const totalMinutes = Math.round(num * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const EodModal = React.memo(({ token, onClose, onSubmitSuccess, onSignOut }: { token: string; onClose: () => void; onSubmitSuccess?: () => void; onSignOut: () => void; }) => {
  const getTodayStr = () => new Date().toISOString().split("T")[0];

  const [rows, setRows] = useState<{ id: string; task: string; hours: string }[]>(() => {
    const saved = localStorage.getItem("eod_draft_v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.date === getTodayStr() && Array.isArray(parsed.rows)) {
          return parsed.rows.map((r: any) => ({ ...r, id: r.id || crypto.randomUUID(), hours: formatToHHMM(r.hours || "") }));
        }
      } catch (e) {}
    }
    // Check legacy draft just in case
    const legacySaved = localStorage.getItem("eod_draft");
    if (legacySaved) {
      localStorage.removeItem("eod_draft"); // clear it
    }
    return [{ id: crypto.randomUUID(), task: "", hours: "" }];
  });

  const [top3Tasks, setTop3Tasks] = useState<[string, string, string]>(() => {
    const saved = localStorage.getItem("eod_top3_draft");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return ["", "", ""];
  });

  const [loading, setLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
  };

  useEffect(() => {
    localStorage.setItem("eod_draft_v2", JSON.stringify({ date: getTodayStr(), rows }));
  }, [rows]);

  useEffect(() => {
    localStorage.setItem("eod_top3_draft", JSON.stringify(top3Tasks));
  }, [top3Tasks]);

  useEffect(() => {
    const fetchExistingEod = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/me/eod/today`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.data?.data?.completedItems) {
          const items = res.data.data.completedItems as string[];
          const newRows = items.map(item => {
            let taskObj = { task: item, hours: "" };
            // Support legacy (X.Xh) format
            const oldMatch = item.match(/^(.*) \(([\d.]+)h\)$/);
            if (oldMatch) {
              taskObj = { task: oldMatch[1], hours: oldMatch[2] };
            } else {
              // Support new format "Task - Hours"
              const newMatch = item.match(/^(.*) - (.*)$/);
              if (newMatch) {
                taskObj = { task: newMatch[1], hours: newMatch[2] };
              }
            }
            return { ...taskObj, id: crypto.randomUUID() };
          });
          if (newRows.length > 0) {
            setRows(newRows);
          }
        }
        if (res.data?.data?.top3Tasks) {
          const t3 = res.data.data.top3Tasks;
          setTop3Tasks([t3[0] || "", t3[1] || "", t3[2] || ""]);
        }
      } catch (err) {
        // Silently ignore if no EOD exists or error
      }
    };
    fetchExistingEod();
  }, [token]);

  const handleAddRow = () => setRows([...rows, { id: crypto.randomUUID(), task: "", hours: "" }]);
  const handleReset = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 3000);
      return;
    }
    setRows([{ id: crypto.randomUUID(), task: "", hours: "" }]);
    setTop3Tasks(["", "", ""]);
    localStorage.removeItem("eod_draft_v2");
    localStorage.removeItem("eod_top3_draft");
    setResetConfirm(false);
  };
  
  const handleUpdate = (index: number, field: "task" | "hours", value: string) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const combineTasks = (prevRows: { id: string; task: string; hours: string }[], newRows: { task: string; hours: string }[]) => {
    const validPrev = prevRows.filter(p => p.task.trim() !== "");
    return [...validPrev, ...newRows.map(r => ({ ...r, id: crypto.randomUUID() }))];
  };

  const processTableData = (text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 1) return;
    
    const parsedRows = lines.map(line => {
      // 1. Try splitting by tab
      let cols = line.split('\t');
      
      // 2. If no tab, try splitting by 2 or more spaces
      if (cols.length < 2) {
        cols = line.split(/ {2,}/);
      }
      
      if (cols.length >= 2) {
        const hoursPart = formatToHHMM(cols[cols.length - 1].trim());
        const taskPart = cols.slice(0, cols.length - 1).join(" ").trim();
        return { task: taskPart, hours: hoursPart };
      } else if (cols.length === 1) {
        return { task: cols[0].trim(), hours: "" };
      }
      return null;
    }).filter(r => r && r.task) as { task: string; hours: string }[];
    
    if (parsedRows.length > 0) {
      if (parsedRows[0].task.toLowerCase() === "task" || parsedRows[0].task.toLowerCase() === "description") {
        parsedRows.shift();
      }
      setRows(prev => combineTasks(prev, parsedRows));
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
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
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
            // Skip header if it looks like one
            if (i === 0 && row.length > 0 && String(row[0]).toLowerCase().includes("task")) continue;
            
            const task = String(row[0] || "");
            const hours = row.length > 1 ? formatToHHMM(String(row[1] || "").trim()) : "";
            if (task.trim()) {
              parsedRows.push({ task, hours });
            }
          }
          
          if (parsedRows.length > 0) {
            setRows(prev => combineTasks(prev, parsedRows));
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
          if (i === 0 && row.length > 0 && String(row[0]).toLowerCase().includes("task")) continue;
          
          const task = String(row[0] || "");
          const hours = row.length > 1 ? formatToHHMM(String(row[1] || "").trim()) : "";
          if (task.trim()) {
            parsedRows.push({ task, hours });
          }
        }

        if (parsedRows.length > 0) {
          setRows(prev => combineTasks(prev, parsedRows));
        } else {
          showError("Could not extract tasks and hours from the Excel file.");
        }
      } catch (err) {
        showError("Failed to parse Excel file.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async () => {
    const valid = rows.filter(r => r.task.trim().length > 0);
    if (valid.length === 0) return showError("Please enter at least one task");

    if (!submitConfirm) {
      setSubmitConfirm(true);
      setTimeout(() => setSubmitConfirm(false), 3000);
      return;
    }

    const completedItems = valid.map(r => {
      if (r.hours && r.hours.trim() !== "") {
        return `${r.task} - ${r.hours.trim()}`;
      }
      return r.task;
    });
    
    setLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_BASE_URL}/me/eod`, {
        summary: "End of Day submission",
        completedItems,
        top3Tasks: top3Tasks.filter(t => t.trim().length > 0)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      localStorage.removeItem("eod_draft_v2");
      localStorage.removeItem("eod_top3_draft");
      setSubmitConfirm(false);
      
      if (onSubmitSuccess) onSubmitSuccess();
      onClose();
    } catch (err) {
      showError("Failed to submit EOD");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div 
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{ background: "#fff", padding: 24, borderRadius: 12, width: 500, boxShadow: "0 10px 25px rgba(0,0,0,0.2)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#0f172a" }}>🌙 End of Day Submission</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
          Log tasks throughout the day. It auto-saves. <br/><b>Paste / Drop a table</b> anywhere here.
        </p>
        
        {errorMsg && <div style={{ background: "#fee2e2", color: "#ef4444", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{errorMsg}</div>}

        {/* Top 3 Tasks Section */}
        <div style={{ marginBottom: 16, background: "#f8fafc", padding: "12px 16px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 13, color: "#334155", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>🌟 Top 3 Tasks Completed Today</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700, width: 14 }}>{i + 1}.</span>
                <input
                  type="text"
                  placeholder={`e.g. Completed feature X...`}
                  value={top3Tasks[i]}
                  onChange={e => {
                    const newTasks = [...top3Tasks] as [string, string, string];
                    newTasks[i] = e.target.value;
                    setTop3Tasks(newTasks);
                  }}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "inline-block", padding: "8px 12px", background: "#f1f5f9", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer", border: "1px dashed #cbd5e1" }}>
            📁 Upload Excel (.xlsx)
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ display: "none" }} />
          </label>
        </div>

        <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ textAlign: "left", padding: "8px 0", fontSize: 12, color: "#64748b", fontWeight: 600 }}>Task Description</th>
                <th style={{ textAlign: "left", padding: "8px 0", fontSize: 12, color: "#64748b", fontWeight: 600, width: 100 }}>Time / Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id}>
                  <td style={{ padding: "6px 4px 6px 0" }}>
                    <input
                      value={row.task || ""}
                      onChange={(e) => handleUpdate(i, "task", e.target.value)}
                      placeholder="e.g. Built Analytics dashboard"
                      style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </td>
                  <td style={{ padding: "6px 0 6px 4px" }}>
                    <input
                      type="text"
                      value={row.hours || ""}
                      onChange={(e) => handleUpdate(i, "hours", e.target.value)}
                      onBlur={() => handleUpdate(i, "hours", formatToHHMM(row.hours))}
                      placeholder="e.g. 2:30 or 45m"
                      style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <button onClick={handleAddRow} style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 13, cursor: "pointer", padding: 0 }}>
              + Add another row
            </button>
            <button onClick={handleReset} style={{ background: "none", border: "none", color: resetConfirm ? "red" : "#ef4444", fontSize: 13, cursor: "pointer", padding: 0, fontWeight: resetConfirm ? "bold" : "normal" }}>
              {resetConfirm ? "Click to confirm reset" : "Reset list"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>Draft auto-saved locally.</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button 
              onClick={onClose} 
              disabled={loading}
              style={{ padding: "10px 16px", borderRadius: 8, background: "#f1f5f9", color: "#475569", border: "none", fontWeight: 600, cursor: "pointer" }}
            >
              Close
            </button>
            <button 
              onClick={handleSubmit} 
              disabled={loading}
              style={{ padding: "10px 16px", borderRadius: 8, background: submitConfirm ? "#22c55e" : "#3b82f6", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}
            >
              {loading ? "Submitting..." : submitConfirm ? "Click to Confirm" : "Submit Final EOD"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
