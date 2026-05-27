import { app } from "electron";
import path from "path";
import fs from "fs";
import type { TrackingEvent } from "@workforce/shared-types";

export class EventQueueStore {
  private db: any = null;
  private isFallback = false;
  private fallbackPath: string;
  private memoryQueue: TrackingEvent[] = [];

  constructor() {
    const userDataPath = app.getPath("userData");
    this.fallbackPath = path.join(userDataPath, "offline-events.json");
    
    try {
      // Synchronous require to properly catch load errors during boot
      const Database = require("better-sqlite3");
      const dbPath = path.join(userDataPath, "offline-events.db");
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payload TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("[EventQueue] Loaded better-sqlite3 successfully");
    } catch (err: any) {
      console.warn("[EventQueue] Failed to load better-sqlite3. Falling back to JSON file queue.", err?.message);
      this.isFallback = true;
      this.loadFallback();
    }
  }

  private loadFallback() {
    try {
      if (fs.existsSync(this.fallbackPath)) {
        this.memoryQueue = JSON.parse(fs.readFileSync(this.fallbackPath, 'utf8'));
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
      const stmt = this.db.prepare('INSERT INTO events (payload) VALUES (?)');
      stmt.run(JSON.stringify(event));
    } catch (err) {
      console.error("Failed to insert event into SQLite queue:", err);
    }
  }

  public getBatch(size: number = 500): TrackingEvent[] {
    if (this.isFallback || !this.db) {
      return this.memoryQueue.slice(0, size);
    }
    try {
      const stmt = this.db.prepare('SELECT payload FROM events ORDER BY id ASC LIMIT ?');
      const rows = stmt.all(size) as { payload: string }[];
      return rows.map((r: any) => JSON.parse(r.payload));
    } catch (err) {
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
      const stmt = this.db.prepare('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY id ASC LIMIT ?)');
      stmt.run(size);
    } catch (err) {
      console.error("Failed to remove batch from SQLite queue:", err);
    }
  }

  public get length() {
    if (this.isFallback || !this.db) {
      return this.memoryQueue.length;
    }
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM events');
      const row = stmt.get() as { count: number };
      return row.count;
    } catch (err) {
      return 0;
    }
  }
}

export const eventQueue = new EventQueueStore();