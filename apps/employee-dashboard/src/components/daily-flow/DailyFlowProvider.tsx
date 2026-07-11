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

function formatDate(d: string) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export function DailyFlowProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const {
    modal,
    openModal,
    close,
    timeUpAcknowledged,
    acknowledgeTimeUp,
    reset,
    pendingEodDate,
    setPendingEodDate,
  } = useDailyFlowStore();
  const checkedTodoRef = useRef(false);

  // Reset on user change
  useEffect(() => {
    if (!isAuthenticated) {
      reset();
      checkedTodoRef.current = false;
    }
  }, [isAuthenticated, reset]);

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

  // Server-enforced gate: check for missing EODs on prior workdays
  const { data: pendingData } = useQuery({
    queryKey: ["my-eod-pending"],
    queryFn: () => api.get("/api/me/eod/pending").then((r) => r.data.data),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // 1) Highest priority: pending EOD from previous workday blocks everything
  useEffect(() => {
    if (!user) return;
    const pending = pendingData?.pendingDate ?? null;
    setPendingEodDate(pending);
    if (pending) openModal("pendingEod");
  }, [user, pendingData, setPendingEodDate, openModal]);

  // 2) On first load — if no todo today AND no pending EOD, prompt todo
  useEffect(() => {
    if (!user || !todoFetched) return;
    if (checkedTodoRef.current) return;
    if (pendingEodDate) return; // pending EOD takes priority
    checkedTodoRef.current = true;
    if (!todoToday) openModal("todo");
  }, [user, todoFetched, todoToday, pendingEodDate, openModal]);

  // 3) Watch shift end time — fire time-up modal once per session
  useEffect(() => {
    if (!user || !myShift?.shift?.shiftEndTime) return;
    if (eodToday) return;
    if (timeUpAcknowledged) return;
    if (modal) return;

    const check = () => {
      if (
        isAfterShiftEnd(myShift.shift.shiftEndTime) &&
        !useDailyFlowStore.getState().timeUpAcknowledged
      ) {
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
      {modal === "pendingEod" && pendingEodDate && (
        <EodModal
          forceSubmit
          date={pendingEodDate}
          title="Complete your missing EOD"
          subtitle={`You have a pending end-of-day report for ${formatDate(pendingEodDate)}. Please complete it to continue.`}
          onClose={close}
          onSubmitted={() => {
            close();
            setPendingEodDate(null);
          }}
        />
      )}
      {modal === "todo" && <TodoModal onSaved={close} />}
      {modal === "eod" && (
        <EodModal
          onClose={close}
          onSubmitted={() => {
            close();
            logout();
          }}
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
