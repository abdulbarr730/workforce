"use client";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useDailyFlowStore } from "@/store/daily-flow.store";
import { TodoModal } from "./TodoModal";
import { EodModal } from "./EodModal";
import { TimeUpModal } from "./TimeUpModal";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function isAfterShiftEnd(shiftEndTime?: string): boolean {
  if (!shiftEndTime) return false;
  const [h, m] = shiftEndTime.split(":").map(Number);
  if (isNaN(h)) return false;
  const now = new Date();
  const end = new Date();
  end.setHours(h, m || 0, 0, 0);
  return now.getTime() >= end.getTime();
}

export function DailyFlowProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { modal, openModal, close, timeUpAcknowledged, acknowledgeTimeUp, reset } = useDailyFlowStore();
  const checkedTodoRef = useRef(false);

  // Reset on user change
  useEffect(() => { if (!isAuthenticated) { reset(); checkedTodoRef.current = false; } }, [isAuthenticated, reset]);

  const { data: todoToday, isFetched: todoFetched } = useQuery({
    queryKey: ["my-todo-today"],
    queryFn: () => api.get("/api/me/todos/today").then((r) => r.data.data),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: myShift } = useQuery({
    queryKey: ["my-shift"],
    queryFn: () => api.get("/api/me/shift").then((r) => r.data.data),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const { data: eodToday } = useQuery({
    queryKey: ["my-eod-today"],
    queryFn: () => api.get("/api/me/eod/today").then((r) => r.data.data),
    enabled: !!user,
    staleTime: 60_000,
  });

  // 1) On first load after login — if no todo today, prompt
  useEffect(() => {
    if (!user || !todoFetched) return;
    if (checkedTodoRef.current) return;
    checkedTodoRef.current = true;
    if (!todoToday) openModal("todo");
  }, [user, todoFetched, todoToday, openModal]);

  // 2) Watch shift end time — fire time-up modal once per session
  useEffect(() => {
    if (!user || !myShift?.shift?.shiftEndTime) return;
    if (eodToday) return; // already submitted
    if (timeUpAcknowledged) return;
    if (modal) return;

    const check = () => {
      if (isAfterShiftEnd(myShift.shift.shiftEndTime) && !useDailyFlowStore.getState().timeUpAcknowledged) {
        openModal("timeup");
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [user, myShift, eodToday, timeUpAcknowledged, modal, openModal]);

  return (
    <>
      {children}
      {modal === "todo" && <TodoModal onSaved={close} />}
      {modal === "eod" && (
        <EodModal
          onClose={close}
          onSubmitted={() => { close(); logout(); }}
        />
      )}
      {modal === "timeup" && (
        <TimeUpModal
          shiftEndTime={myShift?.shift?.shiftEndTime}
          onWorkMore={() => acknowledgeTimeUp()}
          onLogout={() => openModal("eod")}
        />
      )}
    </>
  );
}
