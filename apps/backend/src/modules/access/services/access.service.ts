import { AccessRole } from "../model/access-role.model";
import {
  ALL_PERMISSIONS,
  BASE_ROLES,
  BUILT_IN_ROLES,
  permissionFor,
  type BaseRole,
} from "../access-catalog";

export type RoleConfig = {
  key: string;
  name: string;
  description: string;
  builtIn: boolean;
  baseRole: BaseRole;
  adminPortal: boolean;
  fullAccess: boolean;
  permissions: string[];
  isActive: boolean;
};

export const SUPER_ADMIN = "SUPER_ADMIN";
export const isBaseRole = (role: string): role is BaseRole =>
  (BASE_ROLES as readonly string[]).includes(role);

const builtInDefault = (key: BaseRole): RoleConfig => {
  const role = BUILT_IN_ROLES.find((r) => r.key === key)!;
  return { ...role, builtIn: true, baseRole: key, permissions: [], isActive: true };
};

// All roles, cached for a short time; saving a role clears it.
const TTL_MS = 30_000;
let cache: { at: number; roles: Map<string, RoleConfig> } | null = null;
let loading: Promise<Map<string, RoleConfig>> | null = null;

export const clearRoleCache = () => {
  cache = null;
};

const toConfig = (doc: any): RoleConfig => ({
  key: doc.key,
  name: doc.name,
  description: doc.description || "",
  builtIn: Boolean(doc.builtIn),
  baseRole: doc.baseRole,
  adminPortal: Boolean(doc.adminPortal),
  fullAccess: Boolean(doc.fullAccess),
  permissions: (doc.permissions || []).filter((p: string) => ALL_PERMISSIONS.includes(p)),
  isActive: doc.isActive !== false,
});

export async function loadRoles(): Promise<Map<string, RoleConfig>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.roles;
  if (loading) return loading;
  loading = (async () => {
    const docs = await AccessRole.find({}).lean();
    const roles = new Map<string, RoleConfig>();
    // Built-ins always exist, even before anyone saved them.
    for (const r of BUILT_IN_ROLES) roles.set(r.key, builtInDefault(r.key));
    for (const doc of docs) roles.set(doc.key, toConfig(doc));
    for (const r of BUILT_IN_ROLES) {
      const saved = roles.get(r.key)!;
      roles.set(r.key, { ...saved, builtIn: true, baseRole: r.key, isActive: true });
    }
    cache = { at: Date.now(), roles };
    return roles;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export async function getRole(key: string) {
  return (await loadRoles()).get(String(key || "").toUpperCase()) || null;
}

/** The built-in role the server treats this role as (null = unknown / off). */
export async function baseRoleOf(role: string): Promise<string | null> {
  if (role === SUPER_ADMIN || isBaseRole(role)) return role;
  const config = await getRole(role);
  return config && config.isActive ? config.baseRole : null;
}

/** Per-person changes on top of the role (User.accessOverride). */
export type AccessOverride = {
  adminPortal?: boolean | null; // null = as the role
  grant?: string[];
  revoke?: string[];
} | null | undefined;

export type Access = {
  role: string;
  roleName: string;
  baseRole: string;
  superAdmin: boolean;
  adminPortal: boolean;
  fullAccess: boolean;
  permissions: string[];
  // The admin portal comes only from this person's own settings (their role
  // doesn't open it): the server gives the extra powers only to requests
  // from the admin portal, everything else stays as their role.
  portalByOverride: boolean;
  // The person has their own settings on top of the role.
  personal: boolean;
};

const cleanList = (list: unknown) =>
  Array.isArray(list) ? [...new Set(list.map(String).filter((p) => ALL_PERMISSIONS.includes(p)))] : [];

/** An action needs its page; a page taken away takes its actions with it. */
const consistent = (perms: string[]) => {
  const set = new Set(perms);
  for (const p of perms) if (!p.endsWith(".view")) set.add(`${p.split(".")[0]}.view`);
  return ALL_PERMISSIONS.filter((p) => set.has(p));
};

/** What this person may do: their role, plus their own settings. */
export async function accessFor(role: string, override?: AccessOverride): Promise<Access> {
  if (role === SUPER_ADMIN) {
    return {
      role,
      roleName: "Owner",
      baseRole: SUPER_ADMIN,
      superAdmin: true,
      adminPortal: true,
      fullAccess: true,
      permissions: ALL_PERMISSIONS,
      portalByOverride: false,
      personal: false,
    };
  }
  const config = await getRole(role);
  const grant = cleanList(override?.grant);
  const revoke = cleanList(override?.revoke);
  const personal = Boolean(grant.length || revoke.length || typeof override?.adminPortal === "boolean");
  if (!config || !config.isActive) {
    return {
      role,
      roleName: config?.name || role,
      baseRole: config?.baseRole || "EMPLOYEE",
      superAdmin: false,
      adminPortal: false,
      fullAccess: false,
      permissions: [],
      portalByOverride: false,
      personal,
    };
  }
  const roleHasPortal = config.adminPortal;
  const adminPortal =
    typeof override?.adminPortal === "boolean" ? override.adminPortal : roleHasPortal || grant.length > 0;
  const fromRole = roleHasPortal ? (config.fullAccess ? ALL_PERMISSIONS : config.permissions) : [];
  let permissions: string[] = [];
  if (adminPortal) {
    const revoked = new Set(revoke);
    // Taking a page away takes its actions too.
    const revokedPages = new Set(revoke.filter((p) => p.endsWith(".view")).map((p) => p.split(".")[0]));
    permissions = consistent([...fromRole, ...grant]).filter(
      (p) => !revoked.has(p) && !revokedPages.has(p.split(".")[0]),
    );
  }
  return {
    role: config.key,
    roleName: config.name,
    baseRole: config.baseRole,
    superAdmin: false,
    adminPortal,
    fullAccess: adminPortal && roleHasPortal && config.fullAccess && revoke.length === 0,
    permissions,
    portalByOverride: adminPortal && !roleHasPortal,
    personal,
  };
}

/**
 * Whether this request is allowed. Only people with admin-portal access and
 * limited permissions are checked; everyone else keeps the server's normal
 * role checks.
 */
export function missingPermissionFor(access: Access, method: string, path: string) {
  if (access.superAdmin || !access.adminPortal || access.fullAccess) return null;
  const needed = permissionFor(method, path);
  if (!needed) return null;
  return access.permissions.includes(needed) ? null : needed;
}
