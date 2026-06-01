import { eventQueue } from './event.queue';
import axios from 'axios';
import { authStore } from '../store/auth.store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

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

        const response = await axios.post(`${API_BASE_URL}/tracking/ingest`, {
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