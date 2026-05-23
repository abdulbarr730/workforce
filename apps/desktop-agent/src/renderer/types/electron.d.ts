export {};

declare global {
  interface Window {
    electronAPI: {
      saveAuth: (
        token: string,
        user: unknown
      ) => Promise<boolean>;

      getAuth: () => Promise<{
        token?: string;

        user?: unknown;
      }>;

      clearAuth: () => Promise<boolean>;
    };
  }
}