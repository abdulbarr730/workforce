import React, { useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

export const EodModal: React.FC<{ token: string; onClose: () => void; onSignOut: () => void; }> = ({ token, onClose, onSignOut }) => {
  const [rows, setRows] = useState<{ task: string; hours: string }[]>([
    { task: "", hours: "" }
  ]);
  const [loading, setLoading] = useState(false);

  const handleAddRow = () => setRows([...rows, { task: "", hours: "" }]);
  
  const handleUpdate = (index: number, field: "task" | "hours", value: string) => {
    const newRows = [...rows];
    newRows[index][field] = value;
    setRows(newRows);
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
        const data = XLSX.utils.sheet_to_json<any>(ws);

        // Assume columns are Task and Hours (case insensitive) or just take first two keys
        const parsedRows = data.map(row => {
          const keys = Object.keys(row);
          const taskVal = row.Task || row.task || row.TASK || row[keys[0]] || "";
          const hoursVal = row.Hours || row.hours || row.HOURS || row[keys[1]] || "";
          return { task: String(taskVal), hours: String(hoursVal) };
        }).filter(r => r.task);

        if (parsedRows.length > 0) {
          setRows(parsedRows);
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

    let totalHours = 0;
    const completedItems = valid.map(r => {
      const h = parseFloat(r.hours) || 0;
      totalHours += h;
      return `${r.task} (${h}h)`;
    });
    
    setLoading(true);
    try {
      await axios.post("http://localhost:5000/api/me/eod", {
        summary: "End of Day submission",
        completedItems,
        hoursWorked: totalHours || undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert("EOD Submitted successfully!");
      // After EOD, usually we end the tracking and sign out, or close.
      // We'll close modal and let dashboard handle logout.
      onSignOut();
    } catch (err) {
      alert("Failed to submit EOD");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ background: "#fff", padding: 24, borderRadius: 12, width: 500, boxShadow: "0 10px 25px rgba(0,0,0,0.2)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#0f172a" }}>🌙 End of Day Submission</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
          Log your tasks and hours manually, or upload an Excel sheet.
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
                <th style={{ textAlign: "left", padding: "8px 0", fontSize: 12, color: "#64748b", fontWeight: 600, width: 100 }}>Hours</th>
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
                      type="number"
                      step="0.5"
                      value={row.hours}
                      onChange={(e) => handleUpdate(i, "hours", e.target.value)}
                      placeholder="Hours"
                      style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleAddRow} style={{ marginTop: 8, background: "none", border: "none", color: "#3b82f6", fontSize: 13, cursor: "pointer", padding: 0 }}>
            + Add another row
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button 
            onClick={onClose} 
            disabled={loading}
            style={{ padding: "10px 16px", borderRadius: 8, background: "#f1f5f9", color: "#475569", border: "none", fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            style={{ padding: "10px 16px", borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}
          >
            {loading ? "Submitting..." : "Submit EOD & Log Out"}
          </button>
        </div>
      </div>
    </div>
  );
};
