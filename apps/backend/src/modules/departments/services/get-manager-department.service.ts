import { Department } from "../model/department.model";

export const getManagerDepartment = async (managerId: string) => {
  return await Department.findOne({
    managerId,

    isActive: true,
  }).lean();
};
