import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { AccessRole } from "../model/access-role.model";
import { User } from "../../users/model/user.model";
import { ACCESS_PAGES, ALL_PERMISSIONS, BASE_ROLES, BUILT_IN_ROLES } from "../access-catalog";
import { accessFor, clearRoleCache, getRole, isBaseRole, loadRoles, SUPER_ADMIN } from "../services/access.service";
import { clearUserRoleCache } from "../../../shared/middlwares/auth.middleware";

/** GET /api/access/me: what the signed-in person can see and do. */
export const getMyAccessController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const role = req.user?.accessRole || req.user?.role || "";
  res.json(successResponse(req.user?.access || (await accessFor(role))));
});

/** GET /api/access/catalog: pages and actions a role can be given. */
export const getAccessCatalogController = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(successResponse({ pages: ACCESS_PAGES, baseRoles: BASE_ROLES }));
});

/** GET /api/access/roles: every role with how many people have it. */
export const listRolesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roles = [...(await loadRoles()).values()];
  const counts = await (User as any).aggregate([
    { $match: { deletedAt: null, role: { $ne: SUPER_ADMIN } } },
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);
  const countBy = new Map(counts.map((c: any) => [c._id, c.count]));
  const order = (key: string) => {
    const i = BUILT_IN_ROLES.findIndex((r) => r.key === key);
    return i === -1 ? 100 : i;
  };
  const list = roles
    .map((role) => ({ ...role, people: countBy.get(role.key) || 0 }))
    .sort((a, b) => order(a.key) - order(b.key) || a.name.localeCompare(b.name));
  // Only the Super Admin sees switched-off roles and permission details.
  const visible =
    req.user?.role === SUPER_ADMIN
      ? list
      : list
          .filter((r) => r.isActive)
          .map(({ key, name, baseRole, adminPortal, people }) => ({ key, name, baseRole, adminPortal, people }));
  res.json(successResponse(visible));
});

const cleanKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

const readRoleBody = (body: any) => {
  const name = String(body?.name || "").trim().slice(0, 60);
  const description = String(body?.description || "").trim().slice(0, 300);
  const baseRole = String(body?.baseRole || "");
  const adminPortal = body?.adminPortal === true;
  const fullAccess = body?.fullAccess === true;
  const permissions = Array.isArray(body?.permissions)
    ? [...new Set<string>(body.permissions.map(String).filter((p: string) => ALL_PERMISSIONS.includes(p)))]
    : [];
  // A page's actions need the page itself.
  for (const p of [...permissions]) {
    const view = `${String(p).split(".")[0]}.view`;
    if (!permissions.includes(view)) permissions.push(view);
  }
  return { name, description, baseRole, adminPortal, fullAccess, permissions };
};

/** POST /api/access/roles: a new role (e.g. CEO, OPERATIONS). */
export const createRoleController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const key = cleanKey(req.body?.key || req.body?.name);
  if (!key) throw new AppError("Give the role a name.", 400);
  if (key === SUPER_ADMIN || isBaseRole(key)) throw new AppError("That role already exists.", 400);
  if (await AccessRole.exists({ key })) throw new AppError("A role with this name already exists.", 400);
  const data = readRoleBody(req.body);
  if (!data.name) data.name = key;
  if (!isBaseRole(data.baseRole)) throw new AppError("Choose what the role acts as (Employee, Manager, HR or Admin).", 400);
  const role = await (AccessRole as any).create({ key, ...data, builtIn: false, isActive: true, updatedByName: null });
  clearRoleCache();
  res.status(201).json(successResponse(role, "Role created."));
});

/** PUT /api/access/roles/:key: change what a role can do. */
export const updateRoleController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const key = cleanKey(req.params.key);
  if (key === SUPER_ADMIN) throw new AppError("This role can't be changed.", 400);
  const builtIn = isBaseRole(key);
  const existing: any = await AccessRole.findOne({ key }).lean();
  if (!existing && !builtIn) throw new AppError("Role not found.", 404);
  const data = readRoleBody(req.body);
  const update: Record<string, unknown> = {
    name: data.name || existing?.name || BUILT_IN_ROLES.find((r) => r.key === key)?.name || key,
    description: data.description,
    adminPortal: data.adminPortal,
    fullAccess: data.fullAccess,
    permissions: data.permissions,
  };
  if (builtIn) {
    update.baseRole = key;
    update.builtIn = true;
  } else if (isBaseRole(data.baseRole)) {
    update.baseRole = data.baseRole;
  }
  const role = await AccessRole.findOneAndUpdate(
    { key },
    { $set: update, $setOnInsert: { key, isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
  clearRoleCache();
  res.json(successResponse(role, "Role saved."));
});

/** PATCH /api/access/roles/:key/active: switch a custom role off or on (never deleted). */
export const setRoleActiveController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const key = cleanKey(req.params.key);
  if (key === SUPER_ADMIN || isBaseRole(key)) throw new AppError("Built-in roles can't be switched off.", 400);
  const isActive = req.body?.isActive === true;
  const role = await AccessRole.findOneAndUpdate({ key }, { $set: { isActive } }, { returnDocument: "after" });
  if (!role) throw new AppError("Role not found.", 404);
  clearRoleCache();
  res.json(
    successResponse(
      role,
      isActive ? "Role switched on." : "Role switched off. People with it can't sign in until it's switched on or they get another role.",
    ),
  );
});

const personView = async (user: any) => {
  const role = await getRole(user.role);
  const roleOnly = await accessFor(user.role);
  return {
    user: { _id: user._id, name: user.name, email: user.email, employeeId: user.employeeId, role: user.role, isActive: user.isActive },
    roleName: role?.name || user.role,
    roleAccess: roleOnly,
    override: {
      adminPortal: typeof user.accessOverride?.adminPortal === "boolean" ? user.accessOverride.adminPortal : null,
      grant: user.accessOverride?.grant || [],
      revoke: user.accessOverride?.revoke || [],
      updatedAt: user.accessOverride?.updatedAt || null,
    },
    effective: await accessFor(user.role, user.accessOverride),
  };
};

const loadPerson = async (id: string) => {
  const user: any = await User.findById(id).select("name email employeeId role isActive accessOverride deletedAt").lean();
  if (!user || user.deletedAt) throw new AppError("Person not found.", 404);
  if (user.role === SUPER_ADMIN) throw new AppError("This account always has full access.", 400);
  return user;
};

/** GET /api/access/users/:id: a person's role access and their own settings. */
export const getPersonAccessController = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(successResponse(await personView(await loadPerson(String(req.params.id)))));
});

/** GET /api/access/users: everyone who has their own settings. */
export const listPersonalAccessController = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const users: any[] = await (User as any)
    .find({
      deletedAt: null,
      role: { $ne: SUPER_ADMIN },
      $or: [
        { "accessOverride.adminPortal": { $in: [true, false] } },
        { "accessOverride.grant.0": { $exists: true } },
        { "accessOverride.revoke.0": { $exists: true } },
      ],
    })
    .select("name email employeeId role isActive accessOverride")
    .sort({ name: 1 })
    .lean();
  res.json(successResponse(await Promise.all(users.map(personView))));
});

/**
 * PUT /api/access/users/:id { adminPortal: true|false|null, grant: [], revoke: [] }
 * Extra or removed pages / actions for one person, on top of their role.
 */
export const setPersonAccessController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await loadPerson(String(req.params.id));
  const clean = (list: unknown) =>
    Array.isArray(list) ? [...new Set<string>(list.map(String).filter((p) => ALL_PERMISSIONS.includes(p)))] : [];
  const adminPortal = typeof req.body?.adminPortal === "boolean" ? req.body.adminPortal : null;
  const grant = clean(req.body?.grant);
  const revoke = clean(req.body?.revoke).filter((p) => !grant.includes(p));
  await User.updateOne(
    { _id: user._id },
    { $set: { accessOverride: { adminPortal, grant, revoke, updatedAt: new Date() } } },
  );
  clearUserRoleCache(String(user._id));
  const updated = await loadPerson(String(user._id));
  res.json(
    successResponse(
      await personView(updated),
      adminPortal === null && !grant.length && !revoke.length
        ? `${user.name} now has exactly their role's access.`
        : `Saved ${user.name}'s access. It applies within a minute.`,
    ),
  );
});
