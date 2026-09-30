import { Response } from "express";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import {
  generateTempPassword,
  sendLoginDetailsEmail,
} from "../../../shared/services/email.service";
import { User } from "../model/user.model";

import { asyncHandler } from "../../../shared/utils/async-handler";

import { successResponse } from "../../../shared/utils/api-response";

import { createUserSchema } from "../validators/create-user.validator";

import { createUser } from "../services/create-user.service";
import { dispatchCrmWebhook } from "../../crm/services/crm-webhook.service";
import { assertCanAssignRole } from "../services/role-assignment.service";

export const createUserController = asyncHandler(
  async (
    req: AuthRequest,

    res: Response,
  ) => {
    const validatedData = createUserSchema.parse(req.body);
    validatedData.role = await assertCanAssignRole(req.user, validatedData.role);

    // "Email login details": a one-time password is made and emailed; the
    // person sets their own on first sign-in (agent or dashboard).
    const sendLoginEmail = req.body?.sendLoginEmail === true || !validatedData.password;
    // A typed password becomes the one-time password; otherwise one is made.
    const tempPassword = sendLoginEmail ? validatedData.password || generateTempPassword() : null;
    const user: any = await createUser({
      ...validatedData,
      password: tempPassword || validatedData.password,
    });

    let emailStatus: string | null = null;
    if (tempPassword) {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            mustChangePassword: true,
            tempPasswordExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      );
      const result = await sendLoginDetailsEmail({
        to: user.email,
        name: user.name,
        employeeId: user.employeeId,
        tempPassword,
        sentBy: { employeeId: req.user?.employeeId, name: req.user?.name },
      });
      emailStatus = result.status;
    }

    // Trigger CRM Webhook asynchronously
    dispatchCrmWebhook("employee.created", user);

    return res.status(201).json(
      successResponse(
        { ...(user.toObject ? user.toObject() : user), emailStatus },
        emailStatus === "SENT"
          ? "User created. Login details were emailed."
          : emailStatus === "NOT_CONFIGURED"
            ? "User created, but email is not set up on the server, so no login details were sent."
            : emailStatus === "FAILED"
              ? "User created, but the login email could not be sent. Use 'Send login details' to try again."
              : "User created successfully",
      ),
    );
  },
);
