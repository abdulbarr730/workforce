import React, { useState, useEffect } from "react";
import axios from "axios";

export const TodoModal: React.FC<{ token: string; onClose: () => void }> = ({ token, onClose }) => {
  const [tasks, setTasks] = useState([{ text: "", done: false }]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get("http://localhost:5000/api/me/todos/today", {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => {
      const existing = r.data?.data?.items;
      if (Array.isArray(existing) && existing.length > 0) {
        setTasks(existing);
      }
    }).catch(() => {});
  }, [token]);

  const handleAddRow = () => setTasks([...tasks, { text: "", done: false }]);
  
  const handleUpdate = (index: number, text: string) => {
    const newTasks = [...tasks];
    newTasks[index].text = text;
    setTasks(newTasks);
  };

  const handleSubmit = async () => {
    const valid = tasks.filter(t => t.text.trim().length > 0);
    if (valid.length === 0) return alert("Please enter at least one task");
    
    setLoading(true);
    try {
      await axios.post("http://localhost:5000/api/me/todos", { items: valid }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onClose();
    } catch (err) {
      alert("Failed to submit Todo list");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ background: "#fff", padding: 24, borderRadius: 12, width: 400, boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#0f172a" }}>☀️ Start of Day: To-Do List</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>Please list your tasks for today.</p>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {tasks.map((task, i) => (
            <input
              key={i}
              value={task.text}
              onChange={(e) => handleUpdate(i, e.target.value)}
              placeholder={`Task ${i + 1}`}
              style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
            />
          ))}
          <button onClick={handleAddRow} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#3b82f6", fontSize: 13, cursor: "pointer", padding: 0 }}>
            + Add another task
          </button>
        </div>

        <button 
          onClick={handleSubmit} 
          disabled={loading}
          style={{ width: "100%", padding: "12px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}
        >
          {loading ? "Saving..." : "Start Working"}
        </button>
      </div>
    </div>
  );
};
