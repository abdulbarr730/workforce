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
