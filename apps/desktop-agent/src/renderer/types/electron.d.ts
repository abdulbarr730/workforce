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
    };
  }
}
