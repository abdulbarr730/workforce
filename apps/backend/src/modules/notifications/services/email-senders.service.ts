import { env } from "../../../config/env";
import { EmailSettings } from "../model/email-settings.model";

/** Groups of emails that can each have their own sender. */
export const SENDER_GROUPS = [
  {
    key: "ACCOUNT",
    label: "Accounts & passwords",
    description: "Welcome / login details, password resets and reminders.",
    categories: ["WELCOME", "PASSWORD_RESET", "PASSWORD_REMINDER"],
    example: "no-reply@",
    defaultName: "Prosync Accounts",
  },
  {
    key: "HR",
    label: "HR decisions",
    description: "Leave decisions, attendance changes and corrections, work-from-elsewhere decisions.",
    categories: ["LEAVE_DECIDED", "CORRECTION_DECIDED", "ATTENDANCE_UPDATED", "REMOTE_START_DECIDED"],
    example: "hr@",
    defaultName: "Prosync HR",
  },
] as const;

export type SenderGroup = (typeof SENDER_GROUPS)[number]["key"];
export type Sender = { address: string; name: string; replyTo: string | null };

export const groupForCategory = (category: string): SenderGroup =>
  (SENDER_GROUPS.find((g) => (g.categories as readonly string[]).includes(category))?.key || "ACCOUNT") as SenderGroup;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => EMAIL.test(value);

// Cached for a minute; saving clears it.
let cache: { at: number; senders: Map<string, { address: string; name: string; replyTo: string }> } | null = null;
export const clearSenderCache = () => {
  cache = null;
};

async function savedSenders() {
  if (cache && Date.now() - cache.at < 60_000) return cache.senders;
  const doc: any = await EmailSettings.findOne({ key: "default" }).lean().catch(() => null);
  const senders = new Map<string, { address: string; name: string; replyTo: string }>();
  for (const s of doc?.senders || []) senders.set(s.group, s);
  cache = { at: Date.now(), senders };
  return senders;
}

/** The sender for one email (saved setting, else the server default). */
export async function senderFor(category: string, group?: string): Promise<Sender> {
  const saved = (await savedSenders()).get(group || groupForCategory(category));
  return {
    address: saved?.address || env.MAIL_FROM_ADDRESS,
    name: saved?.name || env.MAIL_FROM_NAME,
    replyTo: saved?.replyTo || null,
  };
}

/** All groups with what is saved and what is actually used. */
export async function listSenders() {
  const saved = await savedSenders();
  return SENDER_GROUPS.map((g) => {
    const s = saved.get(g.key);
    return {
      key: g.key,
      label: g.label,
      description: g.description,
      example: g.example,
      suggestedName: g.defaultName,
      address: s?.address || "",
      name: s?.name || "",
      replyTo: s?.replyTo || "",
      using: {
        address: s?.address || env.MAIL_FROM_ADDRESS || null,
        name: s?.name || env.MAIL_FROM_NAME,
      },
    };
  });
}
