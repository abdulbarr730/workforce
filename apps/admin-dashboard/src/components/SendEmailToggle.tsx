"use client";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";

/** "Send email" choice for an action area, remembered in this browser. */
export function useSendEmailChoice(key: string, fallback = false) {
  const storageKey = `wf_send_email_${key}`;
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) setValue(saved === "1");
    } catch {}
  }, [storageKey]);
  const update = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {}
  };
  return [value, update] as const;
}

export function SendEmailToggle({
  checked,
  onChange,
  label = "Send email to the employee",
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
        checked ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-600"
      } ${className}`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Mail className="h-3.5 w-3.5" />
      {label}
    </label>
  );
}
