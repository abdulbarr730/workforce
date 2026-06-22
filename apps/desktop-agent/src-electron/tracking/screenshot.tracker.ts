import { desktopCapturer } from 'electron';
import { authStore } from '../store/auth.store';
import { app } from 'electron';
import axios from 'axios';

const API_BASE_URL = app.isPackaged ? 'https://prosync-backend.onrender.com/api' : 'http://localhost:5000/api';
let screenshotInterval: NodeJS.Timeout | null = null;
let isScreenshotTrackingEnabled = false;
let currentIntervalMs = 5 * 60 * 1000; // default 5 mins

export const startScreenshotTracker = () => {
  if (screenshotInterval) return;
  
  // Helper to check and capture
  const checkAndCapture = async () => {
    if (!isScreenshotTrackingEnabled) return;
    await captureAndUploadScreenshot();
  };

  // Run immediately
  checkAndCapture();
  
  // Then run every interval
  screenshotInterval = setInterval(checkAndCapture, currentIntervalMs);
};

export const stopScreenshotTracker = () => {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
};

export const setScreenshotTrackingEnabled = (enabled: boolean, intervalSeconds?: number) => {
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

import * as fs from 'fs';
import * as path from 'path';

function logToDesktop(message: string) {
  try {
    const desktopPath = path.join(app.getPath('home'), 'Desktop', 'prosync-screenshot.log');
    const time = new Date().toISOString();
    fs.appendFileSync(desktopPath, `[${time}] ${message}\n`);
  } catch (e) {}
}

async function captureAndUploadScreenshot() {
  try {
    logToDesktop("Starting capture attempt...");
    const token = authStore.get('token');
    const user = authStore.get('user');
    
    if (!token || !user) {
      logToDesktop("Missing token or user.");
      return;
    }

    logToDesktop("Getting sources...");
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    if (!sources || sources.length === 0) {
      logToDesktop("No screen sources found.");
      return;
    }
    
    logToDesktop("Converting to PNG...");
    const primarySource = sources[0];
    const imageBuffer = primarySource.thumbnail.toPNG();
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    logToDesktop("Getting signature from backend...");
    const sigResponse = await axios.post(`${API_BASE_URL}/screenshots/signature`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const { signature, timestamp, cloudName, apiKey, folder } = sigResponse.data;
    if (!cloudName || !apiKey) {
      logToDesktop("Missing cloudName or apiKey from backend signature.");
      return;
    }

    logToDesktop(`Uploading to Cloudinary (cloudName: ${cloudName})...`);
    const formData = new FormData();
    formData.append('file', base64Image);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folder);

    const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!cloudinaryResponse.ok) {
      const errText = await cloudinaryResponse.text();
      logToDesktop(`Cloudinary upload failed: ${cloudinaryResponse.status} ${errText}`);
      return;
    }

    const cloudinaryData = await cloudinaryResponse.json();
    const imageUrl = cloudinaryData.secure_url;
    logToDesktop(`Cloudinary upload success: ${imageUrl}`);

    logToDesktop("Confirming upload to Backend...");
    await axios.post(`${API_BASE_URL}/screenshots/confirm`, {
      deviceId: user.employeeId + '-device',
      imageUrl,
      capturedAt: new Date().toISOString()
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    logToDesktop('Successfully completed full screenshot tracking cycle.');
    console.log('[Screenshot Tracker] Successfully captured and uploaded screenshot.');
  } catch (error: any) {
    logToDesktop(`Error in captureAndUploadScreenshot: ${error.message} - ${error.response?.data ? JSON.stringify(error.response.data) : ''}`);
    console.error('[Screenshot Tracker] Error capturing/uploading screenshot:', error);
  }
}

