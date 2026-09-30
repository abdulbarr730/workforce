import { User } from "../../modules/users/model/user.model";
import { UserRole } from "../../_shared/constants";

/**
 * Super Admin is the developer account. Its actions are never written to any
 * audit log / history, and anything it logged earlier is hidden everywhere.
 */
export const SUPER_ADMIN = "SUPER_ADMIN";

export const isSuperAdmin = (role?: unknown) => String(role || "") === SUPER_ADMIN;

let cache: { ids: Set<string>; names: Set<string>; at: number } | null = null;

/** Employee IDs and names of Super Admin accounts (cached for a minute). */
export async function getSuperAdmins() {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const users = await User.find({ role: UserRole.SUPER_ADMIN }).select("employeeId name").lean();
  cache = {
    ids: new Set(users.map((u: any) => String(u.employeeId)).filter(Boolean)),
    names: new Set(users.map((u: any) => String(u.name)).filter(Boolean)),
    at: Date.now(),
  };
  return cache;
}

/** The actor's name for a log, or null for a Super Admin (not logged). */
export const loggedName = (user?: { role?: unknown; name?: string | null }) =>
  isSuperAdmin(user?.role) ? null : user?.name || null;

/** True if a stored log entry was made by a Super Admin. */
export const bySuperAdmin = (
  admins: { ids: Set<string>; names: Set<string> },
  entry: { role?: unknown; employeeId?: unknown; name?: unknown },
) =>
  isSuperAdmin(entry.role) ||
  (entry.employeeId !== undefined && admins.ids.has(String(entry.employeeId))) ||
  (entry.name !== undefined && admins.names.has(String(entry.name)));

/**
 * Removes Super Admin traces from a stored request (leave / correction):
 * its history steps and its name as decider.
 */
export function withoutSuperAdmin<T extends Record<string, any>>(
  admins: { ids: Set<string>; names: Set<string> },
  row: T,
): T {
  const history = Array.isArray(row.history)
    ? row.history.filter(
        (h: any) =>
          !bySuperAdmin(admins, { role: h.byRole, employeeId: h.byEmployeeId, name: h.byName }),
      )
    : row.history;
  const deciderHidden =
    (row.approvedBy && admins.ids.has(String(row.approvedBy))) ||
    (row.decidedBy && admins.ids.has(String(row.decidedBy))) ||
    (row.decidedByName && admins.names.has(String(row.decidedByName)));
  return {
    ...row,
    history,
    ...(deciderHidden ? { decidedByName: null } : {}),
  };
}

/** Blanks names of Super Admins in simple "by" fields. */
export const hideName = (
  admins: { names: Set<string> },
  name: string | null | undefined,
) => (name && admins.names.has(String(name)) ? null : name ?? null);
