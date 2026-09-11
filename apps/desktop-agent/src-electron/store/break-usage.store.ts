import Store from "electron-store";

type BreakUsageSchema = {
  dailyUsageSeconds?: Record<string, number>;
};

const breakUsageStore = new Store<BreakUsageSchema>({
  name: "break-usage",
}) as unknown as {
  get<K extends keyof BreakUsageSchema>(key: K): BreakUsageSchema[K];
  set<K extends keyof BreakUsageSchema>(key: K, value: BreakUsageSchema[K]): void;
};

const getKolkataDateKey = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
};

const getUsageMap = () => breakUsageStore.get("dailyUsageSeconds") || {};

export function getTodayBreakUsageSeconds() {
  const usage = getUsageMap();
  const key = getKolkataDateKey();
  return Math.max(0, Math.round(Number(usage[key] || 0)));
}

export function addTodayBreakUsageSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  if (!safeSeconds) return getTodayBreakUsageSeconds();
  const usage = getUsageMap();
  const key = getKolkataDateKey();
  const next = Math.max(0, Math.round(Number(usage[key] || 0))) + safeSeconds;
  breakUsageStore.set("dailyUsageSeconds", {
    ...usage,
    [key]: next,
  });
  return next;
}
