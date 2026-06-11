import React, { useState, useEffect } from "react";
import axios from "axios";

export const TodoModal = React.memo(({ token, onClose }: { token: string; onClose: () => void }) => {
  const [tasks, setTasks] = useState<{ id: string, text: string, done: boolean }[]>([{ id: crypto.randomUUID(), text: "", done: false }]);
  const [loading, setLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
  };

  useEffect(() => {
    axios.get(`${import.meta.env.VITE_API_BASE_URL}/me/todos/today`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => {
      const existing = r.data?.data?.items;
      if (Array.isArray(existing) && existing.length > 0) {
        setTasks(existing.map((t: any) => ({ ...t, id: t.id || crypto.randomUUID() })));
      }
    }).catch(() => {});
  }, [token]);

  const handleAddRow = () => setTasks([...tasks, { id: crypto.randomUUID(), text: "", done: false }]);
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
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 1) return;
    
    const parsedRows = lines.map(line => {
      const cols = line.split(/\t|,/);
      return { id: crypto.randomUUID(), text: cols[0].trim(), done: false };
    }).filter(r => r.text);
    
    if (parsedRows.length > 0) {
      if (parsedRows[0].text.toLowerCase() === "task" || parsedRows[0].text.toLowerCase() === "description") {
        parsedRows.shift();
      }
      setTasks(prev => {
        const keep = prev.filter(p => p.text.trim() !== "");
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
    // Could add Excel parsing here if needed, but Todo is usually just strings
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleUpdate = (index: number, text: string) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], text };
    setTasks(newTasks);
  };

  const handleSubmit = async () => {
    const valid = tasks.filter(t => t.text.trim().length > 0);
    if (valid.length === 0) return showError("Please enter at least one task");
    
    setLoading(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_BASE_URL}/me/todos`, { items: valid }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onClose();
    } catch (err) {
      showError("Failed to submit Todo list");
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
        style={{ background: "#fff", padding: 24, borderRadius: 12, width: 400, boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#0f172a" }}>📝 Start of Day: To-Do List</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>Please list your tasks for today. You can <b>Paste</b> or <b>Drop</b> a list here.</p>
        
        {errorMsg && <div style={{ background: "#fee2e2", color: "#ef4444", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{errorMsg}</div>}
        
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {tasks.map((task, i) => (
            <input
              key={task.id}
              value={task.text}
              onChange={(e) => handleUpdate(i, e.target.value)}
              placeholder={`Task ${i + 1}`}
              style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
            />
          ))}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button onClick={handleAddRow} style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 13, cursor: "pointer", padding: 0 }}>
              + Add another task
            </button>
            <button onClick={handleReset} style={{ background: "none", border: "none", color: resetConfirm ? "red" : "#ef4444", fontSize: 13, cursor: "pointer", padding: 0, fontWeight: resetConfirm ? "bold" : "normal" }}>
              {resetConfirm ? "Click to confirm reset" : "Reset list"}
            </button>
          </div>
        </div>

        <button 
          onClick={handleSubmit} 
          disabled={loading}
          style={{ width: "100%", padding: "12px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}
        >
          {loading ? "Saving..." : "Save To-Do List"}
        </button>
      </div>
    </div>
  );
});
