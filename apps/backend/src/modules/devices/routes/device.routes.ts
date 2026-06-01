import { Router } from "express";
import { authenticate } from "../../../shared/middlwares/auth.middleware";
import { authorize } from "../../../shared/middlwares/role.middleware";
import { UserRole } from "../../../_shared/constants";
import { listDevicesController } from "../controllers/list-devices.controller";
import { assignDeviceController, unassignDeviceController } from "../controllers/assign-device.controller";
import { deleteDeviceController } from "../controllers/delete-device.controller";
import { updateDeviceController } from "../controllers/update-device.controller";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  listDevicesController
);
router.patch(
  "/:deviceId/assign",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  assignDeviceController
);
router.patch(
  "/:deviceId/unassign",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR),
  unassignDeviceController
);
router.patch(
  "/:deviceId",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  updateDeviceController
);
router.delete(
  "/:deviceId",
  authorize(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  deleteDeviceController
);

export default router;
