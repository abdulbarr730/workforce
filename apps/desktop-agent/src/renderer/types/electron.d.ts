export {};

declare global {
  interface Window {
    electronAPI: {
      saveAuth: (token: string, user: unknown) => Promise<boolean>;

      getAuth: () => Promise<{
        token?: string;

        user?: unknown;
      }>;

      clearAuth: () => Promise<boolean>;

      sendIdleResponse: (isWorking: boolean, reason?: string) => void;

      onForceLogout: (callback: () => void) => void;

      onNewDay: (callback: () => void) => void;
    };
  }
}
