import { Router } from "express";
import {
  generateSignature,
  confirmUpload,
  getScreenshots,
  toggleScreenshotTracking,
} from "./screenshot.controller";
import { authenticate } from "../../shared/middlwares/auth.middleware";

const router = Router();

// Used by desktop agent to get upload credentials
router.post("/signature", authenticate, generateSignature);

// Used by desktop agent to confirm successful upload
router.post("/confirm", authenticate, confirmUpload);

// Used by Admin/Super Admin to view screenshots
router.get("/:userId", authenticate, getScreenshots);

// Used by Super Admin to assign/enable screenshots
router.post("/toggle/:userId", authenticate, toggleScreenshotTracking);

export default router;
