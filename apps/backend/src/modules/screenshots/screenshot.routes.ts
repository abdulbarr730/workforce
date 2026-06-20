import { Router } from "express";
import { generateSignature, confirmUpload, getScreenshots, toggleScreenshotTracking } from "./screenshot.controller";
import { protect } from "../../_shared/middlewares/auth.middleware";

const router = Router();

// Used by desktop agent to get upload credentials
router.post("/signature", protect, generateSignature);

// Used by desktop agent to confirm successful upload
router.post("/confirm", protect, confirmUpload);

// Used by Admin/Super Admin to view screenshots
router.get("/:userId", protect, getScreenshots);

// Used by Super Admin to assign/enable screenshots
router.post("/toggle/:userId", protect, toggleScreenshotTracking);

export default router;
