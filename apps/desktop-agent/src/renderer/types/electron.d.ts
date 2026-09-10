export {};

declare global {
  interface Window {
    electronAPI: {
      saveAuth: (token: string, user: unknown) => Promise<boolean>;

      getAuth: () => Promise<{
        token?: string;

        user?: unknown;
      }>;

      clearAuth: (reason?: string) => Promise<boolean>;

      sendIdleResponse: (isWorking: boolean, reason?: string) => void;

      onForceLogout: (callback: () => void) => void;

      onNewDay: (callback: () => void) => void;

      onOpenTodo?: (callback: () => void) => void;

      getDeviceId?: () => Promise<string>;

      getDeviceMeta?: () => Promise<{
        hostname?: string | null;
        os?: string | null;
        platform?: string | null;
        agentVersion?: string | null;
        hardwareFingerprint?: string | null;
      }>;

      showBreakPrompt?: (options: {
        scheduleId?: string;
        title?: string;
        message?: string;
        detail?: string;
        durationMinutes?: number;
      }) => Promise<"start" | "dismiss" | "later">;

      startBreak?: (options?: {
        scheduleId?: string;
        durationMinutes?: number;
        message?: string;
        plannedStartTime?: string;
        reasonOptions?: string[];
        requireReasonOnReturn?: boolean;
      }) => Promise<boolean>;

      stopBreak?: (options?: { reason?: string }) => Promise<boolean>;

      getBreakState?: () => Promise<{
        isOnBreak: boolean;
        startedAt: string | null;
        endsAt: string | null;
        scheduleId: string | null;
        message: string;
        reasonOptions?: string[];
        requireReasonOnReturn?: boolean;
      }>;

      onBreakStateChanged?: (
        callback: (state?: {
          isOnBreak: boolean;
          startedAt: string | null;
          endsAt: string | null;
          scheduleId: string | null;
          message: string;
          reasonOptions?: string[];
          requireReasonOnReturn?: boolean;
        }) => void,
      ) => void;
    };
  }
}
