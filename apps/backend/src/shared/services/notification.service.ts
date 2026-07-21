import { EventEmitter } from "events";
import { Response } from "express";

class NotificationService extends EventEmitter {
  private clients: Set<Response> = new Set();

  public addClient(res: Response) {
    this.clients.add(res);

    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  public broadcast(event: string, payload: any) {
    const data = JSON.stringify(payload);
    for (const client of this.clients) {
      client.write(`event: ${event}\n`);
      client.write(`data: ${data}\n\n`);
    }
  }
}

export const notificationService = new NotificationService();
