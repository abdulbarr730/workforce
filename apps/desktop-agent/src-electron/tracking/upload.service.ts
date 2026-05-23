import axios from "axios";

import { eventQueue } from "./event.queue";

import { authStore } from "../store/auth.store";

const API_URL =
  "http://localhost:5000/api";

let uploadInterval:
  NodeJS.Timeout | null =
    null;

export const startUploader =
  () => {
    if (
      uploadInterval
    ) {
      return;
    }

    console.log(
      "Uploader started"
    );

    uploadInterval =
      setInterval(
        async () => {
          try {
            const events =
              eventQueue.getAll();

            if (
              events.length === 0
            ) {
              return;
            }

            const token =
              authStore.get(
                "token"
              );

            if (!token) {
              console.log(
                "No auth token found"
              );

              return;
            }

            console.log(
              `Uploading ${events.length} events`
            );

            await axios.post(
              `${API_URL}/tracking/ingest`,

              {
                events
              },

              {
                headers: {
                  Authorization:
                    `Bearer ${token}`
                }
              }
            );

            eventQueue.clear();

            console.log(
              "Upload success"
            );
          } catch (error) {
            console.error(
              "Upload failed:",
              error
            );
          }
        },

        15000
      );
  };

export const stopUploader =
  () => {
    if (
      uploadInterval
    ) {
      clearInterval(
        uploadInterval
      );

      uploadInterval =
        null;
    }

    console.log(
      "Uploader stopped"
    );
  };