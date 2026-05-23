import Store from "electron-store";

type StoreSchema = {
  token: string;

  user: unknown;
};



export const authStore =
  new Store<StoreSchema>({
    name: "auth"
  });