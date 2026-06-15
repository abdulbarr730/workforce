import { eventQueue } from './event.queue';
import axios from 'axios';
import { authStore } from '../store/auth.store';
import { app } from 'electron';

const API_BASE_URL = app.isPackaged ? 'https://workforce-system-backend.vercel.app/api' : 'http://localhost:5000/api';

export class UploadService {
  private isUploading = false;

  public async sync() {
    if (this.isUploading || eventQueue.length === 0) return;

    this.isUploading = true;

    try {
      while (eventQueue.length > 0) {
        const batch = eventQueue.getBatch(500);
        if (batch.length === 0) break;

        // Filter out corrupted events (e.g. missing type) from old bugs
        const validBatch = batch.filter(e => e && e.type);
        
        const token = authStore.get('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

        let response;
        if (validBatch.length > 0) {
          response = await axios.post(`${API_BASE_URL}/tracking/ingest`, {
            events: validBatch
          }, { headers });
        } else {
          // If the entire batch was corrupt, just simulate a success to drop them
          response = { status: 200 };
        }

        if (response.status === 200 || response.status === 201) {
          eventQueue.removeBatch(batch.length);
          console.log(`[Uploader] Successfully synced ${batch.length} events to ${API_BASE_URL}`);
        } else {
          console.error('[Uploader] Server rejected batch. Halting sync.');
          break; 
        }
      }
    } catch (error: any) {
      const fs = require('fs');
      const errData = error.response ? JSON.stringify(error.response.data) : error.message;
      fs.writeFileSync('C:/Users/Acer/OneDrive/Desktop/Dev by Abdul/workforce-platform/apps/desktop-agent/uploader-error.log', `[Uploader] Network failure: ${errData}\n`, { flag: 'a' });
      console.error('[Uploader] Network failure. Events safely kept on disk for next retry.', error.message);
    } finally {
      this.isUploading = false;
    }
  }
}

export const uploadService = new UploadService();