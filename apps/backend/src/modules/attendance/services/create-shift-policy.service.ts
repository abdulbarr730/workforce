import { ShiftPolicy } from "../model/shift-policy.model";
import type { CreateShiftPolicyInput } from "../validators/create-shift-policy.validator";
import { AppError } from "../../../shared/utils/app-error";

export async function createShiftPolicy(
  input: CreateShiftPolicyInput,
  adminEmployeeId: string,
) {
  // 1. Prevent duplicate names
  const existingPolicy = await ShiftPolicy.findOne({ name: input.name });
  if (existingPolicy) {
    throw new AppError(
      `A shift policy with the name '${input.name}' already exists.`,
      409,
    );
  }

  // 2. Manage the Default Flag
  // If this new shift is marked as default, strip the default flag from all others
  if (input.isDefault) {
    await ShiftPolicy.updateMany({}, { isDefault: false });
  }

  // 3. Create the Policy
  // Using the adminEmployeeId to fulfill the createdBy/updatedBy schema requirements
  const shift = await ShiftPolicy.create({
    ...input,
    createdBy: adminEmployeeId,
    updatedBy: adminEmployeeId,
  });

  return shift;
}
