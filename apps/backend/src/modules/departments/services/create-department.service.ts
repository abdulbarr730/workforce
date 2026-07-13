import { Department } from "../model/department.model";

export const createDepartment = async (payload: any) => {
  if (!payload.code) {
    const existingDepartments = await Department.find({}, "code");
    const existingCodes = existingDepartments
      .map((d) => parseInt(d.code || "0", 10))
      .filter((n) => !isNaN(n));

    const nextCodeNumber =
      existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
    payload.code = nextCodeNumber.toString().padStart(2, "0");
  }

  return await Department.create(payload);
};
