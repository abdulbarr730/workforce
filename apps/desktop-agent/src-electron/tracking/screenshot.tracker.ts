import { desktopCapturer } from "electron";
import { authStore } from "../store/auth.store";
import { app } from "electron";
import axios from "axios";
import { eventQueue } from "./event.queue";
import * as crypto from "crypto";

const API_BASE_URL = app.isPackaged
  ? "https://api.prosyncedu.com"
  : "http://localhost:5000/api";
let screenshotInterval: NodeJS.Timeout | null = null;
let isScreenshotTrackingEnabled = false;
let currentIntervalMs = 5 * 60 * 1000; // default 5 mins

export const startScreenshotTracker = () => {
  if (screenshotInterval) return;

  const checkAndCapture = async () => {
    if (!isScreenshotTrackingEnabled) return;
    await captureAndUploadScreenshot();
  };

  checkAndCapture();
  screenshotInterval = setInterval(checkAndCapture, currentIntervalMs);
};

export const stopScreenshotTracker = () => {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
};

export const setScreenshotTrackingEnabled = (
  enabled: boolean,
  intervalSeconds?: number,
) => {
  isScreenshotTrackingEnabled = enabled;

  if (intervalSeconds && intervalSeconds > 0) {
    const newIntervalMs = intervalSeconds * 1000;
    if (newIntervalMs !== currentIntervalMs) {
      currentIntervalMs = newIntervalMs;
      // Restart tracker if it's currently running with old interval
      if (screenshotInterval) {
        stopScreenshotTracker();
        startScreenshotTracker();
      }
    }
  }
};

export const getScreenshotTrackingEnabled = () => isScreenshotTrackingEnabled;

import { systemPreferences } from "electron";
async function captureAndUploadScreenshot() {
  try {
    const token = authStore.get("token");
    const user = authStore.get("user");

    if (!token || !user) {
      return;
    }

    // Check Mac screen recording permissions
    if (process.platform === "darwin") {
      const status = systemPreferences.getMediaAccessStatus("screen");
      if (status !== "granted") {
        console.warn(
          "[Screenshot Tracker] macOS screen recording permission not granted.",
        );
        return; // Wait for user to grant permission
      }
    }

    // Push a debug event to the backend so we can trace it!
    eventQueue.push({
      id: crypto.randomUUID(),
      userId: user.userId,
      employeeId: user.employeeId,
      type: "SCREENSHOT_DEBUG_ATTEMPT" as any,
      timestamp: new Date().toISOString(),
      metadata: { message: "Starting capture attempt" },
    });

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (!sources || sources.length === 0) {
      return;
    }

    const primarySource = sources[0];
    const imageBuffer = primarySource.thumbnail.toJPEG(60);
    const base64Image = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;

    const sigResponse = await axios.post(
      `${API_BASE_URL}/screenshots/signature`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const { signature, timestamp, cloudName, apiKey, folder } =
      sigResponse.data;
    if (!cloudName || !apiKey) {
      return;
    }

    const params = new URLSearchParams();
    params.append("file", base64Image);
    params.append("api_key", apiKey);
    params.append("timestamp", timestamp.toString());
    params.append("signature", signature);
    params.append("folder", folder);

    const cloudinaryResponse = await axios.post(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const imageUrl = cloudinaryResponse.data.secure_url;

    await axios.post(
      `${API_BASE_URL}/screenshots/confirm`,
      {
        deviceId: user.employeeId + "-device",
        imageUrl,
        capturedAt: new Date().toISOString(),
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch (error: any) {
    console.error(
      "[Screenshot Tracker] Error capturing/uploading screenshot:",
      error,
    );
  }
}
