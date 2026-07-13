import { app } from "electron";
import path from "path";
import fs from "fs";
import type { TrackingEvent } from "@workforce/shared-types";

import { DeviceErrorLogger } from "./device-error.logger";

export class EventQueueStore {
  private db: any = null;
  private isFallback = false;
  private fallbackPath: string;
  private memoryQueue: TrackingEvent[] = [];

  private handleDbCorruption(err: any) {
    if (
      err?.message?.includes("database disk image is malformed") ||
      err?.code === "SQLITE_CORRUPT"
    ) {
      console.error(
        "[EventQueue] CRITICAL: SQLite Database is corrupted. Wiping file to recover.",
        err,
      );
      DeviceErrorLogger.logError("sqlite_corruption", err);
      try {
        if (this.db) {
          this.db.close();
          this.db = null;
        }
        const userDataPath = app.getPath("userData");
        const dbPath = path.join(userDataPath, "offline-events.db");
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(dbPath + "-wal")) fs.unlinkSync(dbPath + "-wal");
        if (fs.existsSync(dbPath + "-shm")) fs.unlinkSync(dbPath + "-shm");
      } catch (wipeErr) {
        console.error(
          "[EventQueue] Failed to wipe corrupted database",
          wipeErr,
        );
      }
      this.isFallback = true;
      this.loadFallback();
    }
  }

  constructor() {
    const userDataPath = app.getPath("userData");
    this.fallbackPath = path.join(userDataPath, "offline-events.json");

    try {
      // Synchronous require to properly catch load errors during boot
      const Database = require("better-sqlite3");
      const dbPath = path.join(userDataPath, "offline-events.db");
      this.db = new Database(dbPath);
      this.db.pragma("journal_mode = WAL");

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payload TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("[EventQueue] Loaded better-sqlite3 successfully");
    } catch (err: any) {
      this.handleDbCorruption(err);
      console.warn(
        "[EventQueue] Failed to load better-sqlite3. Falling back to JSON file queue.",
        err?.message,
      );
      this.isFallback = true;
      this.loadFallback();
    }
  }

  private loadFallback() {
    try {
      if (fs.existsSync(this.fallbackPath)) {
        this.memoryQueue = JSON.parse(
          fs.readFileSync(this.fallbackPath, "utf8"),
        );
      }
    } catch {
      this.memoryQueue = [];
    }
  }

  private saveFallback() {
    try {
      fs.writeFileSync(this.fallbackPath, JSON.stringify(this.memoryQueue));
    } catch (err) {
      console.error("[EventQueue] Failed to save fallback queue", err);
    }
  }

  public push(event: TrackingEvent) {
    if (this.isFallback || !this.db) {
      this.memoryQueue.push(event);
      this.saveFallback();
      return;
    }
    try {
      const stmt = this.db.prepare("INSERT INTO events (payload) VALUES (?)");
      stmt.run(JSON.stringify(event));
    } catch (err: any) {
      this.handleDbCorruption(err);
      console.error("Failed to insert event into SQLite queue:", err);
    }
  }

  public getBatch(size: number = 500): TrackingEvent[] {
    if (this.isFallback || !this.db) {
      return this.memoryQueue.slice(0, size);
    }
    try {
      const stmt = this.db.prepare(
        "SELECT id, payload FROM events ORDER BY id ASC LIMIT ?",
      );
      const rows = stmt.all(size) as { id: number; payload: string }[];

      const validEvents: TrackingEvent[] = [];
      for (const row of rows) {
        try {
          validEvents.push(JSON.parse(row.payload));
        } catch (parseErr) {
          console.error(
            `[EventQueue] Corrupt JSON payload at ID ${row.id}. Deleting it.`,
          );
          try {
            this.db.prepare("DELETE FROM events WHERE id = ?").run(row.id);
          } catch {}
        }
      }
      return validEvents;
    } catch (err: any) {
      this.handleDbCorruption(err);
      return [];
    }
  }

  public removeBatch(size: number) {
    if (this.isFallback || !this.db) {
      this.memoryQueue = this.memoryQueue.slice(size);
      this.saveFallback();
      return;
    }
    try {
      const stmt = this.db.prepare(
        "DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY id ASC LIMIT ?)",
      );
      stmt.run(size);
    } catch (err: any) {
      this.handleDbCorruption(err);
      console.error("Failed to remove batch from SQLite queue:", err);
    }
  }

  public get length() {
    if (this.isFallback || !this.db) {
      return this.memoryQueue.length;
    }
    try {
      const stmt = this.db.prepare("SELECT COUNT(*) as count FROM events");
      const row = stmt.get() as { count: number };
      return row.count;
    } catch (err) {
      return 0;
    }
  }
}

export const eventQueue = new EventQueueStore();
