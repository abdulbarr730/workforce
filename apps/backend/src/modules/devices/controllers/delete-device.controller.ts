import { Request, Response } from "express";
import { Device } from "../model/device.model";

export const deleteDeviceController = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const deleted = await Device.findOneAndDelete({ deviceId });
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, error: "Device not found" });
    }
    res.json({ success: true, message: "Device deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete device" });
  }
};
