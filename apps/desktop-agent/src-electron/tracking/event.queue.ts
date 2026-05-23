import { queueStore } from "./event-queue.store";

class EventQueue {
  private queue: any[] = [];

  constructor() {
    /*
      Restore persisted queue
    */

    this.queue =
      queueStore.get(
        "events"
      ) || [];

    console.log(
      `Recovered ${this.queue.length} queued events`
    );
  }

  add(event: any) {
    this.queue.push(event);

    /*
      Persist instantly
    */

    queueStore.set(
      "events",
      this.queue
    );

    console.log(
      `Queue Size: ${this.queue.length}`
    );
  }

  getAll() {
    return this.queue;
  }

  clear() {
    this.queue = [];

    /*
      Clear persisted queue
    */

    queueStore.set(
      "events",
      []
    );
  }

  size() {
    return this.queue.length;
  }
}

export const eventQueue =
  new EventQueue();