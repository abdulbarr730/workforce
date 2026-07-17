import { eventQueue } from "./event.queue";
import axios from "axios";
import { authStore } from "../store/auth.store";
import { app } from "electron";
import { DeviceErrorLogger } from "./device-error.logger";

const API_BASE_URL = app.isPackaged
  ? "https://hr.prosyncedu.com/api"
  : "http://localhost:5000/api";

export class UploadService {
  private isUploading = false;

  public async sync() {
    if (this.isUploading || eventQueue.length === 0) return;

    this.isUploading = true;

    let currentBatchSize = 0;
    try {
      while (eventQueue.length > 0) {
        const batch = eventQueue.getBatch(50);
        currentBatchSize = batch.length;
        if (currentBatchSize === 0) break;

        // Filter out corrupted events (e.g. missing type) from old bugs
        const validBatch = batch.filter((e) => e && e.type);

        const token = authStore.get("token");
        const headers = token
          ? { Authorization: `Bearer ${token}` }
          : undefined;

        let response;
        if (validBatch.length > 0) {
          response = await axios.post(
            `${API_BASE_URL}/tracking/ingest`,
            {
              events: validBatch,
            },
            { headers },
          );
        } else {
          // If the entire batch was corrupt, just simulate a success to drop them
          response = { status: 200 };
        }

        if (response.status === 200 || response.status === 201) {
          eventQueue.removeBatch(currentBatchSize);
          console.log(
            `[Uploader] Successfully synced ${currentBatchSize} events to ${API_BASE_URL}`,
          );
        } else if (
          (response.status >= 400 && response.status < 500) ||
          response.status === 500
        ) {
          // Safety Valve: The backend should NEVER return 400 anymore (due to Event Isolation).
          // If it somehow does, we MUST drop the batch so the queue isn't paralyzed forever.
          eventQueue.removeBatch(currentBatchSize);
          console.error(
            `[Uploader] WARNING: Backend rejected batch with ${response.status}. Batch DROPPED to prevent queue blockage.`,
          );
        } else {
          console.error("[Uploader] Server error. Halting sync.");
          break;
        }
      }
    } catch (error: any) {
      const fs = require("fs");
      const errData = error.response
        ? JSON.stringify(error.response.data)
        : error.message;
      const statusCode = error.response?.status;

      if ((statusCode >= 400 && statusCode < 500) || statusCode === 500) {
        // Safety Valve: If backend throws an error that permanently blocks the queue, drop the batch to prevent infinite queue blockage!
        console.error(
          `[Uploader] WARNING: Backend threw ${statusCode}. Batch DROPPED to prevent queue blockage. Error:`,
          errData,
        );
        DeviceErrorLogger.logError(
          "sync_rejected",
          new Error(`Batch rejected with ${statusCode}. Error: ${errData}`),
        );
        eventQueue.removeBatch(currentBatchSize || 50);
      } else {
        try {
          const path = require("path");
          const logPath = path.join(
            app.getPath("userData"),
            "uploader-error.log",
          );
          fs.writeFileSync(
            logPath,
            `[Uploader] Network failure: ${errData}\n`,
            { flag: "a" },
          );
        } catch (fsErr) {
          console.error("[Uploader] Failed to write error log", fsErr);
          DeviceErrorLogger.logError("fs_write_error", fsErr);
        }
        DeviceErrorLogger.logError(
          "sync_network_failure",
          new Error(`Network failure: ${errData}`),
        );
        console.error(
          "[Uploader] Network failure. Events safely kept on disk for next retry.",
          error.message,
        );
      }
    } finally {
      this.isUploading = false;
    }
  }
}

export const uploadService = new UploadService();
