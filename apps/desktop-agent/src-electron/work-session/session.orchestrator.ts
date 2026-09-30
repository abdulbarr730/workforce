import { API_BASE_URL as CONFIGURED_API_URL } from "../config";
import axios from "axios";

import { authStore } from "../store/auth.store";


const API_BASE = CONFIGURED_API_URL;

export const initializeSession = async () => {
  try {
    const token = authStore.get("token");

    if (!token) {
      console.log("No auth token found");

      return {
        hasActiveSession: false,
      };
    }

    /*
        Check active session
      */

    const response = await axios.get(
      `${API_BASE}/work-sessions/active`,

      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const activeSession = response.data.data;

    /*
        Existing session
      */

    if (activeSession) {
      console.log("Active session restored");

      return {
        hasActiveSession: true,

        session: activeSession,
      };
    }

    /*
        No active session
      */

    console.log("No active session found");

    return {
      hasActiveSession: false,
    };
  } catch (error) {
    console.error("Session initialization failed:", error);

    return {
      hasActiveSession: false,
    };
  }
};
