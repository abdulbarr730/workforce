import { Request, Response } from "express";
import { User } from "../model/user.model";
import { dispatchCrmWebhook } from "../../crm/services/crm-webhook.service";

export const deleteUserController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Employees are archived, never hard-deleted. Attendance, EODs, call
    // assignments and campaign patterns must remain attributable to them.
    const deleted = await User.findByIdAndUpdate(
      id,
      { $set: { isActive: false, deletedAt: new Date() } },
      { new: true },
    ).select("-password");
    if (!deleted) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Trigger CRM Webhook asynchronously
    dispatchCrmWebhook("employee.deleted", deleted);

    res.json({ success: true, message: "Employee archived successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete user" });
  }
};
