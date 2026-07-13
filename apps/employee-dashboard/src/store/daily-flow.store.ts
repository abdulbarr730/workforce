import { create } from "zustand";

type Modal = null | "todo" | "eod" | "timeup" | "pendingEod";

interface DailyFlowState {
  modal: Modal;
  timeUpAcknowledged: boolean;
  pendingEodDate: string | null;
  openModal: (m: Modal) => void;
  setPendingEodDate: (d: string | null) => void;
  close: () => void;
  acknowledgeTimeUp: () => void;
  reset: () => void;
}

export const useDailyFlowStore = create<DailyFlowState>((set) => ({
  modal: null,
  timeUpAcknowledged: false,
  pendingEodDate: null,
  openModal: (m) => set({ modal: m }),
  setPendingEodDate: (d) => set({ pendingEodDate: d }),
  close: () => set({ modal: null }),
  acknowledgeTimeUp: () => set({ timeUpAcknowledged: true, modal: null }),
  reset: () =>
    set({ modal: null, timeUpAcknowledged: false, pendingEodDate: null }),
}));
