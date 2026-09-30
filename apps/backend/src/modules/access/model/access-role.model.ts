import mongoose from "mongoose";

/**
 * A role people can be given. Built-in roles (ADMIN, HR, MANAGER, EMPLOYEE)
 * are created on first use; custom roles (e.g. CEO, OPERATIONS) act as one of
 * them on the server (`baseRole`) and can be limited page by page.
 * Roles are never deleted, only switched off.
 */
const accessRoleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    builtIn: { type: Boolean, default: false },
    baseRole: { type: String, enum: ["EMPLOYEE", "MANAGER", "HR", "ADMIN"], required: true },
    adminPortal: { type: Boolean, default: false },
    // Everything in the admin portal, including pages added later.
    fullAccess: { type: Boolean, default: false },
    // "<page>.<action>" keys (see access-catalog.ts) when not fullAccess.
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    updatedByName: { type: String, default: null },
  },
  { timestamps: true },
);

export const AccessRole = mongoose.model("AccessRole", accessRoleSchema);
