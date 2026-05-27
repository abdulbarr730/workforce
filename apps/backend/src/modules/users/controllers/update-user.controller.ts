import { Request, Response } from "express";
import { User } from "../model/user.model";

export const updateUserController = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Prevent sensitive fields from being updated directly via this generic route
    delete updates.password;
    delete updates.companyId;

    const updated = await User.findByIdAndUpdate(id, updates, { new: true }).select("-password");
    if (!updated) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.json({ success: true, data: updated, message: "User updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update user" });
  }
};
