import { Department } from "../model/department.model";

export const createDepartment =
  async (
    payload: any
  ) => {
    return await Department.create(
      payload
    );
  };