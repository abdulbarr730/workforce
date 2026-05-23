import { Router } from "express";

import shiftPolicyRoutes from "./shift-policy.routes";

const router = Router();

router.use(
  "/shift-policies",

  shiftPolicyRoutes
);

export default router;