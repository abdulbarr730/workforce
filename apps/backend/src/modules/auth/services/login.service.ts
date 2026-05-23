import bcrypt from "bcrypt";

import jwt from "jsonwebtoken";

import { User } from "../../users/model/user.model";

import { AppError } from "../../../shared/utils/app-error";

import { env } from "../../../config/env";

export const loginUser =
  async (
    email: string,

    password: string
  ) => {
    const user =
      await User.findOne({
        email
      });

    if (!user) {
      throw new AppError(
        "Invalid credentials",

        401
      );
    }

    const isPasswordCorrect =
      await bcrypt.compare(
        password,

        user.password
      );

    if (!isPasswordCorrect) {
      throw new AppError(
        "Invalid credentials",

        401
      );
    }

    /*
      Rich operational JWT
    */

    const token = jwt.sign(
      {
        userId:
          user._id.toString(),

        employeeId:
          user.employeeId,

        name:
          user.name,

        role:
          user.role,

        departmentId:
          user.departmentId ||

          null,

        departmentName:
          user.departmentName ||

          null
      },

      env.JWT_SECRET,

      {
        expiresIn: "7d"
      }
    );

    return {
      token,

      user
    };
  };