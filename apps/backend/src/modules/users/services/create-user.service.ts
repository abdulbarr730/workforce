import bcrypt from "bcrypt";

import { User } from "../model/user.model";
import { Department } from "../../departments/model/department.model";

import { AppError } from "../../../shared/utils/app-error";

import { UserRole } from "../../../_shared/constants";

interface CreateUserInput {
  employeeId?: string;
  departmentId?: string;

  name: string;

  email: string;

  password: string;

  role: UserRole;
}

export const createUser = async (payload: CreateUserInput) => {
  if (!payload.employeeId) {
    let deptCode = "01";
    if (payload.departmentId) {
      const department = await Department.findById(payload.departmentId);
      if (department && department.code) {
        deptCode = department.code;
      }
    }

    const usersInDept = await User.find(
      { departmentId: payload.departmentId },
      "employeeId",
    );
    const suffixes = usersInDept
      .map((u) => u.employeeId?.replace(`EMP_${deptCode}_`, "") || "")
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n));

    let assignedSuffix = 1;
    if (payload.role === "MANAGER" && !suffixes.includes(1)) {
      assignedSuffix = 1;
    } else {
      assignedSuffix = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 2;
      if (assignedSuffix === 1 && payload.role !== "MANAGER") {
        assignedSuffix = 2;
      }
    }

    payload.employeeId = `EMP_${deptCode}_${assignedSuffix.toString().padStart(2, "0")}`;
  }

  const existingUser = await User.findOne({
    email: payload.email,
  });

  if (existingUser) {
    throw new AppError(
      "User already exists",

      400,
    );
  }

  const hashedPassword = await bcrypt.hash(
    payload.password,

    10,
  );

  const user = await User.create({
    ...payload,

    password: hashedPassword,
  });

  return user;
};
