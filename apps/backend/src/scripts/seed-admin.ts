import bcrypt from "bcrypt";

import mongoose from "mongoose";

import { env } from "../config/env";

import { User } from "../modules/users/model/user.model";

import { UserRole } from "../_shared/constants";

const seedAdmin = async () => {
  try {
    await mongoose.connect(
      env.MONGO_URI
    );

    const hashedPassword =
      await bcrypt.hash(
        "admin123",

        10
      );

    const existingAdmin =
      await User.findOne({
        email: "admin@prosynchr.prosyncedu.com"
      });

    if (existingAdmin) {
      console.log(
        
        "Admin already exists"
      );

      process.exit(0);
    }

    await User.create({
      employeeId: "EMP001",

      name: "Super Admin",

      email: "admin@prosynchr.prosyncedu.com",

      password: hashedPassword,

      role: UserRole.SUPER_ADMIN
    });

    console.log(
      "Admin created successfully"
    );

    process.exit(0);
  } catch (error) {
    console.error(error);

    process.exit(1);
  }
};

seedAdmin();