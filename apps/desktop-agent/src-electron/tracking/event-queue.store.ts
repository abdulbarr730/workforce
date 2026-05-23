import Store from "electron-store";

type QueueStoreSchema = {
  events: any[];
};

export const queueStore =
  new Store<QueueStoreSchema>({
    name: "tracking-queue",

    defaults: {
      events: []
    }
  });