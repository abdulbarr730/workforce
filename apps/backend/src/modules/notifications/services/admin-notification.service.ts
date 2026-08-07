import { notificationService } from "../../../shared/services/notification.service";
import { AdminNotification } from "../model/admin-notification.model";

export type AuditEntityType = "TODO" | "EOD" | "LEAVE";

type ChangedField = {
  field: string;
  before: unknown;
  after: unknown;
};

export type AuditDiff = {
  added: string[];
  removed: string[];
  changed: ChangedField[];
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export const buildTextListDiff = (
  beforeValues: unknown[] = [],
  afterValues: unknown[] = [],
): AuditDiff => {
  const readText = (value: any) =>
    String(value?.text ?? value?.task ?? value ?? "").trim();
  const before = beforeValues.map(readText).filter(Boolean);
  const after = afterValues.map(readText).filter(Boolean);
  const beforeKeys = new Set(before.map(normalize));
  const afterKeys = new Set(after.map(normalize));

  return {
    added: after.filter((value) => !beforeKeys.has(normalize(value))),
    removed: before.filter((value) => !afterKeys.has(normalize(value))),
    changed: [],
  };
};

export const addChangedFields = (
  diff: AuditDiff,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
) => {
  for (const field of fields) {
    if (
      JSON.stringify(before[field] ?? null) !==
      JSON.stringify(after[field] ?? null)
    ) {
      diff.changed.push({
        field,
        before: before[field] ?? null,
        after: after[field] ?? null,
      });
    }
  }
  return diff;
};

type CreateAuditNotificationInput = {
  kind: string;
  title: string;
  message: string;
  employeeId: string;
  employeeName: string;
  entityType: AuditEntityType;
  entityId: string;
  entityDate?: string | null;
  reason?: string;
  before?: unknown;
  after?: unknown;
  diff?: AuditDiff;
  deepLink: string;
  changedBy?: { employeeId?: string; name?: string; role?: string };
};

export const createAdminAuditNotification = async (
  input: CreateAuditNotificationInput,
) => {
  const notification = await AdminNotification.create({
    ...input,
    audienceRoles: ["ADMIN", "SUPER_ADMIN", "HR"],
    diff: input.diff ?? { added: [], removed: [], changed: [] },
  });

  notificationService.broadcastToRoles(
    ["ADMIN", "SUPER_ADMIN", "HR"],
    "admin_notification",
    { notification: notification.toObject() },
  );

  return notification;
};
