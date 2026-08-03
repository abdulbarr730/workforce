import { Request, Response } from "express";
import { User } from "../model/user.model";
import { dispatchCrmWebhook } from "../../crm/services/crm-webhook.service";

export const deleteUserController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await User.findByIdAndDelete(id).select("-password");
    if (!deleted) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Trigger CRM Webhook asynchronously
    dispatchCrmWebhook("employee.deleted", deleted);

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete user" });
  }
};
