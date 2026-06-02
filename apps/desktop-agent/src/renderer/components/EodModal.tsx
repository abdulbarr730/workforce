import React, { useState, useEffect } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

export const EodModal: React.FC<{ token: string; onClose: () => void; onSubmitSuccess?: () => void; onSignOut: () => void; }> = ({ token, onClose, onSubmitSuccess, onSignOut }) => {
  const [rows, setRows] = useState<{ task: string; hours: string }[]>(() => {
    const saved = localStorage.getItem("eod_draft");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [{ task: "", hours: "" }];
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
            const match = item.match(/^(.*) \(([\d.]+)h\)$/);
            if (match) {
              return { task: match[1], hours: match[2] };
            }
            return { task: item, hours: "" };
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

  const handleAddRow = () => setRows([...rows, { task: "", hours: "" }]);
  const handleReset = () => {
    if (window.confirm("Are you sure you want to clear your entire EOD list?")) {
      setRows([{ task: "", hours: "" }]);
      localStorage.removeItem("eod_draft");
    }
  };
  
  const handleUpdate = (index: number, field: "task" | "hours", value: string) => {
    const newRows = [...rows];
    newRows[index][field] = value;
    setRows(newRows);
  };

  const parseTimeToHours = (val: string): string => {
    const s = val.toString().trim().toLowerCase();
    if (!s) return "";
    
    // Check if it's already a clean number (e.g., "2", "2.5")
    if (!isNaN(Number(s))) return s;

    // Handle complex case "2 hours 30 minutes"
    const complexMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hrs|hours)\s*(\d+(?:\.\d+)?)\s*(?:m|mins|minutes)/);
    if (complexMatch) {
      return (parseFloat(complexMatch[1]) + parseFloat(complexMatch[2]) / 60).toFixed(2);
    }

    // Handle formats like "2:30", "2:30:15"
    if (s.includes(":")) {
      const parts = s.split(":");
      const h = parseInt(parts[0]) || 0;
      const m = parseInt(parts[1]) || 0;
      const sec = parseInt(parts[2]) || 0;
      return (h + m / 60 + sec / 3600).toFixed(2);
    }

    // Handle formats like "45 mins", "45 minutes", "45m"
    const minMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|mins|minutes)$/);
    if (minMatch) {
      return (parseFloat(minMatch[1]) / 60).toFixed(2);
    }

    // Handle formats like "2 hrs", "2 hours", "2h"
    const hrMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|hrs|hours)$/);
    if (hrMatch) {
      return parseFloat(hrMatch[1]).toString();
    }
    
    return s;
  };

  const applyTop3Formatting = (prevRows: { task: string; hours: string }[], newRows: { task: string; hours: string }[]) => {
    let validPrev = prevRows.filter(p => p.task.trim() !== "");
    // Remove existing headers
    validPrev = validPrev.filter(p => !p.task.startsWith("📌") && !p.task.startsWith("📋") && !p.task.startsWith("---"));
    
    // Combine and clean up leading stars so we don't double-star
    const allTasks = [...validPrev, ...newRows].filter(t => !t.task.startsWith("📌") && !t.task.startsWith("📋"));
    const tasksWithTime = allTasks.map(t => {
      const cleanTask = t.task.replace(/^⭐\s*/, '').trim();
      return {
        task: cleanTask,
        hoursRaw: t.hours,
        hoursNum: parseFloat(parseTimeToHours(t.hours)) || 0
      };
    });
    
    // Sort descending by time
    const sorted = [...tasksWithTime].sort((a, b) => b.hoursNum - a.hoursNum);
    const top3 = sorted.slice(0, 3);
    
    // Use a Set based on exact task text to separate the rest
    const top3Names = new Set(top3.map(t => t.task));
    const theRest = tasksWithTime.filter(t => !top3Names.has(t.task));
    
    const finalRows: { task: string; hours: string }[] = [];
    
    if (top3.length > 0) {
      finalRows.push({ task: "📌 Top 3 Tasks", hours: "" });
      top3.forEach(t => finalRows.push({ task: `⭐ ${t.task}`, hours: t.hoursRaw }));
    }
    
    if (theRest.length > 0) {
      finalRows.push({ task: "📋 Other Tasks", hours: "" });
      theRest.forEach(t => finalRows.push({ task: t.task, hours: t.hoursRaw }));
    }
    
    return finalRows;
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
      
      // 3. Fallback: match trailing time pattern
      if (cols.length < 2) {
        const timeMatch = line.match(/^(.*?)\s+([\d:.]+(?:\s*(?:h|m|hrs|mins|hours|minutes))?)$/i);
        if (timeMatch) {
          cols = [timeMatch[1], timeMatch[2]];
        }
      }
      
      if (cols.length >= 2) {
        const hoursPart = cols[cols.length - 1].trim();
        const taskPart = cols.slice(0, cols.length - 1).join(" ").trim();
        return { task: taskPart, hours: parseTimeToHours(hoursPart) };
      } else if (cols.length === 1) {
        return { task: cols[0].trim(), hours: "" };
      }
      return null;
    }).filter(r => r && r.task) as { task: string; hours: string }[];
    
    if (parsedRows.length > 0) {
      if (parsedRows[0].task.toLowerCase() === "task" || parsedRows[0].task.toLowerCase() === "description") {
        parsedRows.shift();
      }
      setRows(prev => applyTop3Formatting(prev, parsedRows));
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
            const hours = row.length > 1 ? parseTimeToHours(String(row[1] || "")) : "";
            if (task.trim()) {
              parsedRows.push({ task, hours });
            }
          }
          
          if (parsedRows.length > 0) {
            setRows(prev => applyTop3Formatting(prev, parsedRows));
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
          const hours = row.length > 1 ? parseTimeToHours(String(row[1] || "")) : "";
          if (task.trim()) {
            parsedRows.push({ task, hours });
          }
        }

        if (parsedRows.length > 0) {
          setRows(prev => applyTop3Formatting(prev, parsedRows));
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

    let totalHours = 0;
    const completedItems = valid.map(r => {
      const isHeader = r.task.startsWith("📌") || r.task.startsWith("📋") || r.task.startsWith("---");
      if (isHeader) {
        return r.task;
      }
      // Intelligently parse before final submission just in case they typed directly
      const parsedHours = parseTimeToHours(r.hours);
      const h = parseFloat(parsedHours) || 0;
      totalHours += h;
      return `${r.task} (${h}h)`;
    });
    
    setLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_BASE_URL}/me/eod`, {
        summary: "End of Day submission",
        completedItems,
        hoursWorked: totalHours || undefined
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
                <tr key={i}>
                  <td style={{ padding: "6px 4px 6px 0" }}>
                    <input
                      value={row.task}
                      onChange={(e) => handleUpdate(i, "task", e.target.value)}
                      placeholder="e.g. Built Analytics dashboard"
                      style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </td>
                  <td style={{ padding: "6px 0 6px 4px" }}>
                    <input
                      type="text"
                      value={row.hours}
                      onChange={(e) => handleUpdate(i, "hours", e.target.value)}
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
};
