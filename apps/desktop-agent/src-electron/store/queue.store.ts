import ElectronStore from "electron-store";

import type { TrackingEvent } from "../../../packages/shared-types/src/tracking-event.interface";

type QueueStoreSchema = {
  events: TrackingEvent[];
};

export const queueStore = new ElectronStore<QueueStoreSchema>({
  name: "tracking-queue",

  defaults: {
    events: [],
  },
});
