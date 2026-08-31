import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../../users/model/user.model";
import { AppError } from "../../../shared/utils/app-error";
import { env } from "../../../config/env";
import { Device } from "../../devices/model/device.model";

export const loginUser = async (
  email: string,
  password: string,
  deviceId?: string,
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

    // A desktop employee session must belong to exactly one physical agent at a
    // time. Mark older devices for sign-out; the desktop shift watcher will
    // pick this up and clear the previous laptop automatically.
    await Device.updateMany(
      {
        employeeId: user.employeeId,
        deviceId: { $ne: deviceId },
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

    await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          employeeId: user.employeeId,
          assignedAt: now,
          lastSeenAt: now,
          lastEventType: "LOGIN",
          pendingAction: null,
        },
      },
      { upsert: true },
    );
  }

  return {
    token,
    user,
  };
};
