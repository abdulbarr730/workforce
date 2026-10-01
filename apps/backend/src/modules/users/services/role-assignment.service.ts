import { AppError } from "../../../shared/utils/app-error";
import { accessFor, getRole, SUPER_ADMIN } from "../../access/services/access.service";

type Requester = { role?: string; accessRole?: string; access?: { permissions: string[] } } | undefined;

const canManageAdminLogins = async (requester: Requester) => {
  if (requester?.role === SUPER_ADMIN) return true;
  const access = requester?.access || (await accessFor(requester?.accessRole || requester?.role || ""));
  return access.permissions.includes("employees.admin_logins");
};

const opensAdminPortal = async (role: string) => {
  if (role === SUPER_ADMIN) return true;
  const config = await getRole(role);
  return Boolean(config?.adminPortal || config?.baseRole === "ADMIN");
};

/**
 * Checks a role change (or a new account's role):
 * - the role must exist and be switched on,
 * - only the Super Admin gives or takes away the Super Admin role,
 * - admin-portal roles need the "admin-portal logins" permission.
 */
export async function assertCanAssignRole(requester: Requester, nextRole: string, currentRole?: string | null) {
  const role = String(nextRole || "").toUpperCase();
  const isSuper = requester?.role === SUPER_ADMIN;

  if (role === SUPER_ADMIN || currentRole === SUPER_ADMIN) {
    if (!isSuper) throw new AppError("You can't give or change this role.", 403);
    return role;
  }
  const config = await getRole(role);
  if (!config || !config.isActive) throw new AppError("Choose a valid role.", 400);

  const touchesPortal =
    (await opensAdminPortal(role)) || (currentRole ? await opensAdminPortal(currentRole) : false);
  if (touchesPortal && !(await canManageAdminLogins(requester))) {
    throw new AppError("You can't give or change admin-portal roles.", 403);
  }
  return config.key;
}

/** Editing someone who has an admin-portal role needs the same permission. */
export async function assertCanEditPerson(requester: Requester, targetRole: string) {
  if (requester?.role === SUPER_ADMIN) return;
  if (targetRole === SUPER_ADMIN) throw new AppError("You can't change this account.", 403);
  if ((await opensAdminPortal(targetRole)) && !(await canManageAdminLogins(requester))) {
    throw new AppError("You can't change admin-portal accounts.", 403);
  }
}
