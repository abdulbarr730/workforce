import { Request, Response } from "express";
import { Screenshot } from "./screenshot.model";
import { User } from "../users/model/user.model";
import { cloudinary } from "../../config/cloudinary";
import { UserRole } from "../../_shared/constants";

export const generateSignature = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    // You can add more parameters like folder, tags, etc.
    const paramsToSign = {
      timestamp: timestamp,
      folder: "prosync_screenshots",
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET || "",
    );

    res.status(200).json({
      timestamp,
      signature,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder: "prosync_screenshots",
    });
  } catch (error) {
    console.error("Error generating Cloudinary signature:", error);
    res.status(500).json({ error: "Failed to generate signature" });
  }
};

export const confirmUpload = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { deviceId, imageUrl, capturedAt } = req.body;
    const user = (req as any).user; // Set by auth middleware

    if (!deviceId || !imageUrl || !capturedAt) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const screenshot = new Screenshot({
      employeeId: user.employeeId,
      deviceId,
      imageUrl,
      capturedAt: new Date(capturedAt),
    });

    await screenshot.save();
    res.status(201).json({ success: true, screenshot });
  } catch (error) {
    console.error("Error saving screenshot metadata:", error);
    res.status(500).json({ error: "Failed to save screenshot metadata" });
  }
};

export const getScreenshots = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { userId } = req.params;
    const user = (req as any).user;

    // Must be Admin or Super Admin to view
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: "Forbidden. Admins only." });
      return;
    }

    // Map userId param to employeeId (accepts either Mongoose _id or human readable employeeId like EMP-001)
    let targetUser;
    if (String(userId).match(/^[0-9a-fA-F]{24}$/)) {
      targetUser = await User.findById(userId);
    }
    if (!targetUser) {
      targetUser = await User.findOne({ employeeId: userId });
    }

    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const limit = parseInt((req.query.limit as string) || "100", 10);
    const dateQuery = req.query.date as string; // Optional YYYY-MM-DD filter

    const query: any = { employeeId: targetUser.employeeId };

    if (dateQuery) {
      const startOfDay = new Date(dateQuery);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(dateQuery);
      endOfDay.setUTCHours(23, 59, 59, 999);
      query.capturedAt = { $gte: startOfDay, $lte: endOfDay };
    }

    const screenshots = await Screenshot.find(query)
      .sort({ capturedAt: -1 })
      .limit(limit);

    res.status(200).json({ screenshots });
  } catch (error) {
    console.error("Error fetching screenshots:", error);
    res.status(500).json({ error: "Failed to fetch screenshots" });
  }
};

export const toggleScreenshotTracking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { enabled, interval } = req.body;
    const user = (req as any).user;

    // Admin and Super Admin can toggle screenshots
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ error: "Forbidden. Admins only." });
      return;
    }

    const updateData: any = { isScreenshotTrackingEnabled: !!enabled };
    if (interval !== undefined && typeof interval === "number") {
      updateData.screenshotInterval = interval;
    }

    const targetUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    });

    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(200).json({
      success: true,
      isScreenshotTrackingEnabled: targetUser.isScreenshotTrackingEnabled,
      screenshotInterval: targetUser.screenshotInterval,
    });
  } catch (error) {
    console.error("Error toggling screenshot tracking:", error);
    res.status(500).json({ error: "Failed to toggle screenshot tracking" });
  }
};
