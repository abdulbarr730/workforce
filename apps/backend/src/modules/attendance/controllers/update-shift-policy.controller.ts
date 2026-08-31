import { Response } from "express";
import { asyncHandler } from "../../../shared/utils/async-handler";
import { successResponse } from "../../../shared/utils/api-response";
import { AppError } from "../../../shared/utils/app-error";
import { AuthRequest } from "../../../shared/middlwares/auth.middleware";
import { ShiftPolicy } from "../model/shift-policy.model";
import { User } from "../../users/model/user.model";

const POLICY_HISTORY_FIELDS = [
  "name",
  "description",
  "activeDays",
  "shiftType",
  "shiftStartTime",
  "shiftEndTime",
  "loginCutoffTime",
  "halfDayAfterTime",
  "halfDayLogoutBeforeTime",
  "absentAfterTime",
  "minimumWorkMinutes",
  "overtimeEnabled",
  "overtimeAfterMinutes",
  "eodTriggerTime",
  "breakDeductionEnabled",
  "defaultBreakMinutes",
  "isDefault",
  "isActive",
];

function snapshotPolicy(policy: any) {
  return POLICY_HISTORY_FIELDS.reduce<Record<string, any>>((acc, field) => {
    acc[field] = policy[field];
    return acc;
  }, {});
}

function describePolicyChanges(before: Record<string, any>, after: Record<string, any>) {
  return POLICY_HISTORY_FIELDS.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  ).map((field) => `${field}: ${JSON.stringify(before[field])} → ${JSON.stringify(after[field])}`);
}

function getEffectiveFromDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const updateShiftPolicyController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const adminEmployeeId = req.user?.employeeId;
    const { id } = req.params;

    if (!adminEmployeeId) {
      throw new AppError("Unauthorized: Missing admin context", 401);
    }

    const existingPolicy = await ShiftPolicy.findById(id);
    if (!existingPolicy) {
      throw new AppError("Shift policy not found", 404);
    }
    const oldName = existingPolicy.name;
    const beforeSnapshot = snapshotPolicy(existingPolicy.toObject());

    if (req.body.name && req.body.name !== existingPolicy.name) {
      const nameExists = await ShiftPolicy.findOne({ name: req.body.name });
      if (nameExists) {
        throw new AppError(
          `A shift policy with the name '${req.body.name}' already exists.`,
          409,
        );
      }
    }

    if (req.body.isDefault && !existingPolicy.isDefault) {
      await ShiftPolicy.updateMany({}, { isDefault: false });
    }

    Object.assign(existingPolicy, req.body);
    existingPolicy.eodTriggerTime =
      req.body.shiftEndTime || existingPolicy.shiftEndTime;
    existingPolicy.updatedBy = adminEmployeeId;
    existingPolicy.effectiveFrom = getEffectiveFromDate();
    const afterSnapshot = snapshotPolicy(existingPolicy.toObject());
    const changes = describePolicyChanges(beforeSnapshot, afterSnapshot);
    if (changes.length > 0) {
      (existingPolicy as any).policyHistory = [
        ...((existingPolicy as any).policyHistory || []),
        {
          changedAt: new Date(),
          effectiveFrom: existingPolicy.effectiveFrom,
          changedBy: adminEmployeeId,
          changedByName: req.user?.name || "",
          before: beforeSnapshot,
          after: afterSnapshot,
          changes,
        },
      ];
    }
    await existingPolicy.save();

    // If the name changed, update any users that have this policy assigned
    if (req.body.name && req.body.name !== oldName) {
      await User.updateMany(
        { assignedShiftPolicyId: id },
        { assignedShiftPolicyName: req.body.name },
      );
    }

    res
      .status(200)
      .json(
        successResponse(existingPolicy, "Shift policy updated successfully"),
      );
  },
);
