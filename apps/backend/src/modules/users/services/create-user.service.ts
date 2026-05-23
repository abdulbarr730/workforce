import bcrypt from "bcrypt";

import { User } from "../model/user.model";

import { AppError } from "../../../shared/utils/app-error";

import { UserRole } from "@workforce/shared-constants";

interface CreateUserInput {
  employeeId: string;

  name: string;

  email: string;

  password: string;

  role: UserRole;
}

export const createUser =
  async (
    payload: CreateUserInput
  ) => {
    const existingUser =
      await User.findOne({
        $or: [
          {
            email:
              payload.email
          },

          {
            employeeId:
              payload.employeeId
          }
        ]
      });

    if (existingUser) {
      throw new AppError(
        "User already exists",

        400
      );
    }

    const hashedPassword =
      await bcrypt.hash(
        payload.password,

        10
      );

    const user =
      await User.create({
        ...payload,

        password:
          hashedPassword
      });

    return user;
  };