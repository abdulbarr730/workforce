import { create } from "zustand";

type Modal = null | "todo" | "eod" | "timeup";

interface DailyFlowState {
  modal: Modal;
  timeUpAcknowledged: boolean;
  openModal: (m: Modal) => void;
  close: () => void;
  acknowledgeTimeUp: () => void;
  reset: () => void;
}

export const useDailyFlowStore = create<DailyFlowState>((set) => ({
  modal: null,
  timeUpAcknowledged: false,
  openModal: (m) => set({ modal: m }),
  close: () => set({ modal: null }),
  acknowledgeTimeUp: () => set({ timeUpAcknowledged: true, modal: null }),
  reset: () => set({ modal: null, timeUpAcknowledged: false }),
}));
