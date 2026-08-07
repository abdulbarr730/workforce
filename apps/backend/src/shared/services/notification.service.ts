import { EventEmitter } from "events";
import { Response } from "express";

interface ClientConnection {
  res: Response;
  role: string;
  employeeId: string;
}

class NotificationService extends EventEmitter {
  private clients: Set<ClientConnection> = new Set();

  public addClient(res: Response, role: string, employeeId: string) {
    const connection: ClientConnection = { res, role, employeeId };
    this.clients.add(connection);

    res.on("close", () => {
      this.clients.delete(connection);
    });
  }

  public broadcast(event: string, payload: any) {
    const data = JSON.stringify(payload);
    for (const client of this.clients) {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${data}\n\n`);
    }
  }

  public broadcastToRole(role: string, event: string, payload: any) {
    const data = JSON.stringify(payload);
    for (const client of this.clients) {
      if (
        client.role === role ||
        (role === "ADMIN" && client.role === "SUPER_ADMIN")
      ) {
        client.res.write(`event: ${event}\n`);
        client.res.write(`data: ${data}\n\n`);
      }
    }
  }

  public broadcastToRoles(roles: string[], event: string, payload: any) {
    const roleSet = new Set(roles);
    const data = JSON.stringify(payload);
    for (const client of this.clients) {
      if (roleSet.has(client.role)) {
        client.res.write(`event: ${event}\n`);
        client.res.write(`data: ${data}\n\n`);
      }
    }
  }

  public broadcastToUser(employeeId: string, event: string, payload: any) {
    const data = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.employeeId === employeeId) {
        client.res.write(`event: ${event}\n`);
        client.res.write(`data: ${data}\n\n`);
      }
    }
  }
}

export const notificationService = new NotificationService();
