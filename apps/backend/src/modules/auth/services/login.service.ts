import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../../users/model/user.model";
import { AppError } from "../../../shared/utils/app-error";
import { env } from "../../../config/env";
import { Device } from "../../devices/model/device.model";
import { upsertDeviceFromEvent } from "../../devices/services/upsert-device-from-event.service";

type LoginDeviceMeta = {
  hostname?: string | null;
  os?: string | null;
  platform?: string | null;
  agentVersion?: string | null;
  hardwareFingerprint?: string | null;
};

export const loginUser = async (
  email: string,
  password: string,
  deviceId?: string,
  deviceMeta?: LoginDeviceMeta,
  ip?: string,
) => {
  const user = await User.findOne({
    email,
  });

  if (!user) {
    throw new AppError(
      "Invalid credentials",

      401,
    );
  }

  const isPasswordCorrect = await bcrypt.compare(
    password,

    user.password,
  );

  if (!isPasswordCorrect) {
    throw new AppError(
      "Invalid credentials",

      401,
    );
  }

  /*
      Rich operational JWT
    */

  const token = jwt.sign(
    {
      userId: user._id.toString(),

      employeeId: user.employeeId,

      name: user.name,

      role: user.role,

      departmentId: user.departmentId || null,

      departmentName: user.departmentName || null,
    },

    env.JWT_SECRET,

    {
      expiresIn: "100y",
    },
  );

  if (deviceId) {
    const now = new Date();
    const registeredDevice = await upsertDeviceFromEvent(
      {
        deviceId,
        employeeId: user.employeeId,
        type: "LOGIN",
        timestamp: now,
        metadata: {
          hostname: deviceMeta?.hostname || undefined,
          os: deviceMeta?.os || undefined,
          platform: deviceMeta?.platform || undefined,
          agentVersion: deviceMeta?.agentVersion || undefined,
          hardwareFingerprint: deviceMeta?.hardwareFingerprint || undefined,
        },
      },
      ip,
    );
    const activeDeviceId = registeredDevice?.deviceId || deviceId;

    // A desktop employee session must belong to exactly one physical agent at a
    // time. Mark older devices for sign-out; the desktop shift watcher will
    // pick this up and clear the previous laptop automatically.
    await Device.updateMany(
      {
        employeeId: user.employeeId,
        deviceId: { $ne: activeDeviceId },
        pendingAction: { $ne: "UNINSTALL" },
      },
      {
        $set: {
          employeeId: null,
          assignedAt: null,
          pendingAction: "SIGNOUT",
          lastEventType: "FORCE_SIGNOUT",
        },
      },
    );
  }

  return {
    token,
    user,
  };
};
