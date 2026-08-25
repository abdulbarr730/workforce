import { Request, Response } from "express";
import { Device } from "../model/device.model";

export const deleteDeviceController = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const deleted = await Device.findOneAndUpdate(
      { deviceId },
      { $set: { pendingAction: "UNINSTALL" } },
      { returnDocument: "after" }
    );
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, error: "Device not found" });
    }
    res.json({ success: true, message: "Device marked for uninstall" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete device" });
  }
};
