import Store from "electron-store";

export type AuthUser = {
  employeeId: string;
  companyId?: string;
  name?: string;
  email?: string;
};

type StoreSchema = {
  token?: string;
  user?: AuthUser;
  /** Last idle timeout received from the server, restored on app start. */
  idleTimeoutMinutes?: number;
  /** Local date (YYYY-MM-DD) on which the employee ended their shift. */
  shiftEndedDate?: string;
  /** Mark Attendance is switched on (last known from the server). */
  markRequired?: boolean;
  /** Local date the employee clicked Start & Mark Attendance. */
  markStartedDate?: string;
  /** When the laptop was first opened / used today. */
  laptopOpenDate?: string;
  laptopOpenAt?: string;
};

// Explicit interface to fix TS inheritance resolution issues with electron-store
export interface IAuthStore {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K];
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void;
  clear(): void;
}

export const authStore = new Store<StoreSchema>({
  name: "auth",
}) as unknown as IAuthStore;
