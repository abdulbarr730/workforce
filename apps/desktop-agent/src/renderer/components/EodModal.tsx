import React, { useState, useEffect } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

export const EodModal = React.memo(({ token, onClose, onSubmitSuccess, onSignOut }: { token: string; onClose: () => void; onSubmitSuccess?: () => void; onSignOut: () => void; }) => {
  const [rows, setRows] = useState<{ id: string; task: string; hours: string }[]>(() => {
    const saved = localStorage.getItem("eod_draft");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((r: any) => ({ ...r, id: r.id || crypto.randomUUID() }));
      } catch (e) {}
    }
    return [{ id: crypto.randomUUID(), task: "", hours: "" }];
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem("eod_draft", JSON.stringify(rows));
  }, [rows]);

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
      } catch (err) {
        // Silently ignore if no EOD exists or error
      }
    };
    fetchExistingEod();
  }, [token]);

  const handleAddRow = () => setRows([...rows, { id: crypto.randomUUID(), task: "", hours: "" }]);
  const handleReset = () => {
    if (window.confirm("Are you sure you want to clear your entire EOD list?")) {
      setRows([{ id: crypto.randomUUID(), task: "", hours: "" }]);
      localStorage.removeItem("eod_draft");
    }
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

  const formatToHHMM = (val: string) => {
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
          alert("Failed to parse dropped Excel file.");
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
          alert("Could not extract tasks and hours from the Excel file.");
        }
      } catch (err) {
        alert("Failed to parse Excel file.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async () => {
    const valid = rows.filter(r => r.task.trim().length > 0);
    if (valid.length === 0) return alert("Please enter at least one task");

    const confirmed = window.confirm("Are you sure you want to submit your EOD report?");
    if (!confirmed) return;

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
        completedItems
        // We no longer calculate or send a misleading manual sum for hoursWorked
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert("EOD Submitted successfully!");
      localStorage.removeItem("eod_draft");
      
      if (onSubmitSuccess) onSubmitSuccess();
      onClose();
    } catch (err) {
      alert("Failed to submit EOD");
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
            <button onClick={handleReset} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 13, cursor: "pointer", padding: 0 }}>
              Reset list
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
              style={{ padding: "10px 16px", borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}
            >
              {loading ? "Submitting..." : "Submit Final EOD"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
