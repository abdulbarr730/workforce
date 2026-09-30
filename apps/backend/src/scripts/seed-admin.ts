/**
 * Creates the first SUPER_ADMIN on a fresh (production) database.
 *
 *   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='long-random' \
 *     pnpm --filter @workforce/backend seed:admin
 *
 * Runs against whatever MONGO_URI points at. Does nothing if that email
 * already exists. For local development use `pnpm seed:dev` instead.
 */
import bcrypt from "bcrypt";

import mongoose from "mongoose";

import { env } from "../config/env";

import { User } from "../modules/users/model/user.model";

import { UserRole } from "../_shared/constants";

const seedAdmin = async () => {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = process.env.ADMIN_NAME || "Super Admin";
  const employeeId = process.env.ADMIN_EMPLOYEE_ID || "EMP001";

  if (!email || password.length < 12) {
    console.error(
      "ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) are required.",
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(env.MONGO_URI);

    const existingAdmin = await User.findOne({ email });

    if (existingAdmin) {
      console.log("Admin already exists");
      process.exit(0);
    }

    await User.create({
      employeeId,
      name,
      email,
      password: await bcrypt.hash(password, 10),
      role: UserRole.SUPER_ADMIN,
    });

    console.log("Admin created successfully");

    process.exit(0);
  } catch (error) {
    console.error(error);

    process.exit(1);
  }
};

seedAdmin();
