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

export type Access = {
  role: string;
  roleName: string;
  baseRole: string;
  superAdmin: boolean;
  adminPortal: boolean;
  fullAccess: boolean;
  permissions: string[];
};

/** What this role may do, for the dashboards. */
export async function accessFor(role: string): Promise<Access> {
  if (role === SUPER_ADMIN) {
    return {
      role,
      roleName: "Owner",
      baseRole: SUPER_ADMIN,
      superAdmin: true,
      adminPortal: true,
      fullAccess: true,
      permissions: ALL_PERMISSIONS,
    };
  }
  const config = await getRole(role);
  if (!config || !config.isActive) {
    return {
      role,
      roleName: config?.name || role,
      baseRole: config?.baseRole || "EMPLOYEE",
      superAdmin: false,
      adminPortal: false,
      fullAccess: false,
      permissions: [],
    };
  }
  return {
    role: config.key,
    roleName: config.name,
    baseRole: config.baseRole,
    superAdmin: false,
    adminPortal: config.adminPortal,
    fullAccess: config.adminPortal && config.fullAccess,
    permissions: config.adminPortal ? (config.fullAccess ? ALL_PERMISSIONS : config.permissions) : [],
  };
}

/**
 * Whether this request is allowed for the role. Only roles with admin-portal
 * access and limited permissions are checked; everything else keeps the
 * server's normal role checks.
 */
export async function missingPermission(role: string, method: string, path: string) {
  if (role === SUPER_ADMIN) return null;
  const needed = permissionFor(method, path);
  if (!needed) return null;
  const config = await getRole(role);
  if (!config || !config.adminPortal || config.fullAccess) return null;
  return config.permissions.includes(needed) ? null : needed;
}
