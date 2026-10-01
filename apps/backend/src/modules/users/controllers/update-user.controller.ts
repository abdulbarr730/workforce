import bcrypt from "bcrypt";
import { Request, Response } from "express";
import { User } from "../model/user.model";
import { dispatchCrmWebhook } from "../../crm/services/crm-webhook.service";
import { AppError } from "../../../shared/utils/app-error";
import { clearUserRoleCache } from "../../../shared/middlwares/auth.middleware";
import {
  assertCanAssignRole,
  assertCanEditPerson,
} from "../services/role-assignment.service";

export const updateUserController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Password state is managed by the password endpoints only.
    for (const key of [
      "mustChangePassword",
      "tempPasswordExpiresAt",
      "passwordChangedAt",
      "passwordResetTokenHash",
      "passwordResetExpiresAt",
      "passwordReminderSentAt",
    ]) {
      delete updates[key];
    }

    // Hash password if provided
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
      // A password typed here is a normal password (not one-time).
      updates.mustChangePassword = false;
      updates.tempPasswordExpiresAt = null;
      updates.passwordChangedAt = new Date();
    } else {
      delete updates.password;
    }

    delete updates.companyId;

    const reqUser = (req as any).user;

    // Roles: who may change whom (Super Admin / admin-portal accounts).
    const target: any = await User.findById(id).select("role").lean();
    if (!target) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    await assertCanEditPerson(reqUser, target.role);
    if (updates.role !== undefined && String(updates.role).toUpperCase() !== target.role) {
      updates.role = await assertCanAssignRole(reqUser, String(updates.role), target.role);
    } else {
      delete updates.role;
    }

    if (reqUser?.role !== "SUPER_ADMIN") {
      delete updates.isScreenshotTrackingEnabled;
      delete updates.screenshotInterval;
    }

    const updated = await User.findByIdAndUpdate(id, updates, {
      returnDocument: "after",
    }).select("-password");
    if (!updated) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (updates.role) clearUserRoleCache(String(updated._id));

    // Trigger CRM Webhook asynchronously
    dispatchCrmWebhook("employee.updated", updated);

    res.json({
      success: true,
      data: updated,
      message: "User updated successfully",
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message, error: error.message });
    }
    res.status(500).json({ success: false, error: "Failed to update user" });
  }
};
