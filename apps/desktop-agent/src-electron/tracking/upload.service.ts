import { eventQueue } from './event.queue';
import axios from 'axios';
import { authStore } from '../store/auth.store';

// Defeat the Vite/Webpack bug that converts missing env vars into the literal string "undefined"
let API_BASE_URL = 'http://localhost:5000'; // Default to Express backend, NOT Next.js (3000)

if (process.env.API_URL && process.env.API_URL !== 'undefined') {
  API_BASE_URL = process.env.API_URL;
} else if (process.env.VITE_API_URL && process.env.VITE_API_URL !== 'undefined') {
  API_BASE_URL = process.env.VITE_API_URL;
}

export class UploadService {
  private isUploading = false;

  public async sync() {
    if (this.isUploading || eventQueue.length === 0) return;

    this.isUploading = true;

    try {
      while (eventQueue.length > 0) {
        const batch = eventQueue.getBatch(500);
        
        const token = authStore.get('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

        const response = await axios.post(`${API_BASE_URL}/api/tracking/ingest`, {
          events: batch
        }, { headers });

        if (response.status === 200 || response.status === 201) {
          eventQueue.removeBatch(batch.length);
          console.log(`[Uploader] Successfully synced ${batch.length} events to ${API_BASE_URL}`);
        } else {
          console.error('[Uploader] Server rejected batch. Halting sync.');
          break; 
        }
      }
    } catch (error: any) {
      console.error('[Uploader] Network failure. Events safely kept on disk for next retry.', error.message);
    } finally {
      this.isUploading = false;
    }
  }
}

export const uploadService = new UploadService();