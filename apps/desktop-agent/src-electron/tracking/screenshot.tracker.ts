import { desktopCapturer } from 'electron';
import { authStore } from '../store/auth.store';
import { app } from 'electron';
import axios from 'axios';

const API_BASE_URL = app.isPackaged ? 'https://prosync-backend.onrender.com/api' : 'http://localhost:5000/api';
const SCREENSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let screenshotInterval: NodeJS.Timeout | null = null;
let isScreenshotTrackingEnabled = false;

export const startScreenshotTracker = () => {
  if (screenshotInterval) return;
  
  screenshotInterval = setInterval(async () => {
    if (!isScreenshotTrackingEnabled) return;
    await captureAndUploadScreenshot();
  }, SCREENSHOT_INTERVAL_MS);
};

export const stopScreenshotTracker = () => {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
};

export const setScreenshotTrackingEnabled = (enabled: boolean) => {
  isScreenshotTrackingEnabled = enabled;
};

export const getScreenshotTrackingEnabled = () => isScreenshotTrackingEnabled;

async function captureAndUploadScreenshot() {
  try {
    const token = authStore.get('token');
    const user = authStore.get('user');
    
    if (!token || !user) return;

    // 1. Capture Screen
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    if (!sources || sources.length === 0) return;
    
    // Use the primary screen
    const primarySource = sources[0];
    const imageBuffer = primarySource.thumbnail.toPNG();
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    // 2. Get Cloudinary Signature from Backend
    const sigResponse = await axios.post(`${API_BASE_URL}/screenshots/signature`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const { signature, timestamp, cloudName, apiKey, folder } = sigResponse.data;

    // 3. Upload directly to Cloudinary
    const formData = new FormData();
    formData.append('file', base64Image);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folder);

    const cloudinaryResponse = await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, formData);
    const imageUrl = cloudinaryResponse.data.secure_url;

    // 4. Confirm upload to Backend
    await axios.post(`${API_BASE_URL}/screenshots/confirm`, {
      deviceId: user.employeeId + '-device', // Basic fallback, ideally use real device ID
      imageUrl,
      capturedAt: new Date().toISOString()
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('[Screenshot Tracker] Successfully captured and uploaded screenshot.');
  } catch (error) {
    console.error('[Screenshot Tracker] Error capturing/uploading screenshot:', error);
  }
}
